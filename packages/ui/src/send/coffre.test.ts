import { describe, it, expect } from "vitest";
import { pseudonymize, unredact, type Vault } from "@openmasq/redact";
import type { Conversation, CoffreTerm } from "../types";
import {
  makeCoffreTerm,
  coffreToForced,
  coffreHasValue,
  coffreOccurrences,
  coffreTypeLabel,
  combinedCoffre,
} from "./coffre";
import { sendKeepList } from "./redactionOptions";

const term = (over: Partial<CoffreTerm> = {}): CoffreTerm => ({
  id: "t1",
  value: "Projet Northwind",
  token: "NAME",
  createdAt: 1,
  ...over,
});

const conv = (over: Partial<Conversation>): Conversation =>
  ({
    id: "c1",
    title: "Sans titre",
    modelId: "poolside/laguna-s-2.1:free",
    messages: [],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Conversation;

describe("makeCoffreTerm", () => {
  it("trims the value + drops an empty note, stamps a token + id + createdAt", () => {
    const t = makeCoffreTerm("  Marcus Foy  ", "NAME", "   ");
    expect(t.value).toBe("Marcus Foy");
    expect(t.token).toBe("NAME");
    expect(t.note).toBeUndefined();
    expect(typeof t.id).toBe("string");
    expect(t.id.length).toBeGreaterThan(0);
    expect(typeof t.createdAt).toBe("number");
  });
  it("keeps a trimmed non-empty note", () => {
    expect(makeCoffreTerm("x", "NAME", "  Compte société ").note).toBe("Compte société");
  });
});

describe("coffreTypeLabel", () => {
  it("maps a known token to its FR label, falls back to the raw token", () => {
    expect(coffreTypeLabel("IBAN")).toBe("IBAN");
    expect(coffreTypeLabel("NAME")).toBe("Nom");
    expect(coffreTypeLabel("WHATEVER")).toBe("WHATEVER");
  });
});

describe("coffreToForced", () => {
  it("maps to {value, category} and drops blanks / undefined", () => {
    expect(coffreToForced(undefined)).toEqual([]);
    expect(
      coffreToForced([term({ value: "A", token: "NAME" }), term({ id: "t2", value: "  ", token: "ORG" })]),
    ).toEqual([{ value: "A", category: "NAME" }]);
  });
});

describe("coffreHasValue", () => {
  it("is case-insensitive + trimmed, false on blank", () => {
    const list = [term({ value: "France" })];
    expect(coffreHasValue(list, "  france ")).toBe(true);
    expect(coffreHasValue(list, "Paris")).toBe(false);
    expect(coffreHasValue(list, "   ")).toBe(false);
    expect(coffreHasValue(undefined, "x")).toBe(false);
  });
});

describe("coffreOccurrences", () => {
  it("counts case-insensitive occurrences across message contents, sorted recent-first", () => {
    const convs = [
      conv({
        id: "a",
        title: "Vieux",
        updatedAt: 10,
        messages: [{ id: "m1", role: "user", content: "Bonjour projet northwind et Projet Northwind" }] as never,
      }),
      conv({
        id: "b",
        title: "Récent",
        updatedAt: 50,
        messages: [{ id: "m2", role: "user", content: "Le PROJET NORTHWIND avance" }] as never,
      }),
      conv({ id: "c", title: "Aucun", updatedAt: 99, messages: [{ id: "m3", role: "user", content: "rien ici" }] as never }),
    ];
    const r = coffreOccurrences(term({ value: "Projet Northwind" }), convs);
    expect(r.convCount).toBe(2);
    expect(r.totalCount).toBe(3); // 2 in "a" + 1 in "b"
    expect(r.uses.map((u) => u.convId)).toEqual(["b", "a"]); // recent first
    expect(r.uses[0].count).toBe(1);
    expect(r.uses[1].count).toBe(2);
    // Each use anchors to the FIRST in-clear message hit (the scroll target).
    expect(r.uses.map((u) => u.msgId)).toEqual(["m2", "m1"]);
  });

  it("counts a conversation whose vault holds the value even with 0 message hits (floor 1)", () => {
    const convs = [
      conv({
        id: "v",
        updatedAt: 5,
        messages: [{ id: "m", role: "assistant", content: "réponse avec un faux nom" }] as never,
        redactionVault: { "[NAME_1]": "Marcus Foy" },
      }),
    ];
    const r = coffreOccurrences(term({ value: "Marcus Foy" }), convs);
    expect(r.convCount).toBe(1);
    expect(r.totalCount).toBe(1);
    expect(r.uses[0].count).toBe(1);
    expect(r.uses[0].msgId).toBeUndefined(); // vault-only hit → no in-clear anchor
  });

  it("returns empty for a blank term value", () => {
    expect(coffreOccurrences(term({ value: "  " }), [conv({ id: "x" })])).toEqual({
      uses: [],
      totalCount: 0,
      convCount: 0,
    });
  });
});

// SECURITY (rule 7): the coffre's whole promise is that its values are ALWAYS redacted
// before a send. The store feeds `coffreToForced(settings.coffre)` into the SAME
// `pseudonymize(text, { forced })` call the send uses, so this exercises the real
// end-to-end contract (coffre → forced → engine) — the exact hole the feature closes —
// without a React store harness. A patterns-only engine (no complete/detectLocal) is
// used deliberately: a plain code phrase it can't detect proves the coffre is what
// protects the value, not the generic rules.
describe("coffre → pseudonymize (send contract)", () => {
  it("redacted every coffre value AS its type, reversibly, even when the engine wouldn't", async () => {
    const coffre = [
      makeCoffreTerm("Projet Colibri", "NAME", "nom de code"),
      makeCoffreTerm("acme-prod-2f19", "SECRET"),
    ];
    const text = "Le Projet Colibri déploie acme-prod-2f19 demain.";
    const vault: Vault = {};
    const res = await pseudonymize(text, { forced: coffreToForced(coffre), vault });

    // Neither real value survives in the wire the model would see.
    expect(res.text).not.toContain("Projet Colibri");
    expect(res.text).not.toContain("acme-prod-2f19");
    // Reversible: the conversation vault restores the original exactly.
    expect(unredact(res.text, vault)).toBe(text);
    // The real values are what the vault maps its placeholders back to.
    expect(Object.values(vault)).toEqual(expect.arrayContaining(["Projet Colibri", "acme-prod-2f19"]));
  });

  it("leaves the same value in CLEAR when it is NOT in the coffre (proves the coffre does the work)", async () => {
    const text = "Le Projet Colibri déploie acme-prod-2f19 demain.";
    const vault: Vault = {};
    const res = await pseudonymize(text, { forced: coffreToForced([]), vault });
    // Patterns-only can't catch the plain code phrase — so without the coffre it leaks.
    expect(res.text).toContain("Projet Colibri");
  });
});

/**
 * `keep` outranks `forced` at the engine — correct for a reveal the user made, wrong for
 * the AUTOMATIC connector list, whose entries are strings a third-party MCP server
 * chooses (connector ids, server names, bare TOOL names). `sendKeepList` therefore drops
 * an automatic entry that collides with a Coffre term.
 */
describe("the Coffre outranks the automatic connector keep-list", () => {
  const conv = { revealedValues: [] };
  const forced = [{ value: "Nightingale", category: "name" }];

  it("drops a connected TOOL name that collides with a Coffre term", () => {
    // The user connected a server exposing `notes__Nightingale`; `connectedKeep` holds
    // the bare tool name. Before the fix this silently disabled the Coffre term.
    expect(sendKeepList(["Nightingale", "stripe"], conv, undefined, forced)).toEqual(["stripe"]);
  });

  it("matches case-insensitively (the Coffre is case-insensitive too)", () => {
    expect(sendKeepList(["nightingale"], conv, undefined, forced)).toEqual([]);
  });

  it("keeps every non-colliding connector name — routing must not break", () => {
    expect(sendKeepList(["stripe", "canva"], conv, undefined, forced)).toEqual(["stripe", "canva"]);
  });

  it("an EXPLICIT reveal still wins: the user asked for it, deliberately", () => {
    expect(sendKeepList([], { revealedValues: ["Nightingale"] }, undefined, forced)).toEqual([
      "Nightingale",
    ]);
    expect(sendKeepList([], conv, ["Nightingale"], forced)).toEqual(["Nightingale"]);
  });

  it("no forced list ⇒ the connector list is untouched (unchanged behaviour)", () => {
    expect(sendKeepList(["Nightingale"], conv, undefined, [])).toEqual(["Nightingale"]);
    expect(sendKeepList(["Nightingale"], conv, undefined)).toEqual(["Nightingale"]);
  });

  it("END-TO-END: the Coffre term survives a colliding tool name on the real engine", async () => {
    const text = "Le patient Nightingale a rendez-vous.";
    const vault: Vault = {};
    const keep = sendKeepList(["Nightingale"], conv, undefined, forced);
    const res = await pseudonymize(text, { forced, keep, vault });
    expect(res.text).not.toContain("Nightingale"); // no longer ships in clear
    expect(unredact(res.text, vault)).toBe(text); // and stays reversible
  });
});

/**
 * LE COFFRE EST INSENSIBLE À LA CASSE — de bout en bout.
 *
 * Sa promesse est « toujours redacted, quelle que soit la source ». La casse ne fait
 * pas partie de l'identité d'une valeur : un terme saisi « ACME2024 » doit masquer
 * « acme2024 » comme « Acme2024 ». La plupart du chemin l'était déjà ; deux endroits ne
 * l'étaient pas, et les deux ne se voyaient QUE sur les valeurs que
 * `entityVariantRegex` refuse de fuzzy-matcher — celles portant un CHIFFRE et les mots
 * isolés de moins de 4 lettres. C'est exactement la forme d'un nom de projet ou d'un
 * sigle d'entreprise, donc pas un cas de bord.
 */
describe("le Coffre est insensible à la casse", () => {
  const COFFRE = [term({ value: "ACME2024", token: "ORG" })];

  it.each([
    ["ACME2024", "un terme AVEC CHIFFRE"],
    ["Nightingale", "un terme alphabétique"],
    ["IBM", "un sigle de moins de 4 lettres"],
  ])("%s — le moteur masque toutes les casses (%s)", async (value) => {
    const forced = [{ value, category: "ORG" }];
    const text = `Contrat ${value.toLowerCase()} et ${value.toUpperCase()} signés.`;
    const vault: Vault = {};
    const res = await pseudonymize(text, { forced, vault });
    expect(res.text.toLowerCase()).not.toContain(value.toLowerCase());
    expect(unredact(res.text, vault)).toBe(text); // et ça reste réversible
  });

  it("les deux casses partagent UNE seule identité (un seul faux)", async () => {
    const vault: Vault = {};
    const _res = await pseudonymize("acme2024 puis ACME2024", {
      forced: [{ value: "ACME2024", category: "ORG" }],
      vault,
    });
    expect(new Set(Object.values(vault).map((v) => v.toLowerCase())).size).toBe(1);
  });

  it("la liste `forced` de l'envoi retient un terme écrit dans une autre casse", () => {
    expect(coffreToForced(COFFRE)).toHaveLength(1);
    expect(coffreHasValue(COFFRE, "  acme2024 ")).toBe(true);
  });

  // Le compteur « N occ · N conv » de la page Coffre : le moteur vaulte la casse RÉELLE
  // du texte, donc un `===` sur la casse SAISIE affichait « 0 conversation » pour un
  // terme pourtant masqué partout.
  it("compte les occurrences quel que soit la casse, message ou vault", () => {
    const inMessage = conv({
      id: "c1",
      messages: [{ id: "m1", role: "user", content: "Facture acme2024 réglée." }],
      updatedAt: 2,
    } as Partial<Conversation>);
    const onlyVault = conv({ id: "c2", redactionVault: { f1: "Acme2024" }, updatedAt: 1 });
    const occ = coffreOccurrences(term({ value: "ACME2024" }), [inMessage, onlyVault]);
    expect(occ.convCount).toBe(2);
    expect(occ.totalCount).toBe(2);
  });
});

describe("coffre d'organisation — même contrat « toujours redacted »", () => {
  // Règle 11 : un terme imposé par l'organisation est forcé dans CHAQUE envoi,
  // exactement comme un terme personnel. `combinedCoffre` est le seul point de
  // fusion — les appelants de l'envoi passent par lui (sendOrchestrator,
  // redactionEngine, ChatView), donc c'est lui qu'on épingle.
  it("fusionne personnel ⊕ org, et tolère l'absence de chaque moitié", () => {
    const perso = makeCoffreTerm("ACME2024", "ORG");
    const org = makeCoffreTerm("Projet-Basilic", "ORG");
    expect(combinedCoffre({ coffre: [perso], orgCoffre: [org] })).toEqual([perso, org]);
    expect(combinedCoffre({ coffre: [perso] })).toEqual([perso]);
    expect(combinedCoffre({ orgCoffre: [org] })).toEqual([org]);
    expect(combinedCoffre(undefined)).toEqual([]);
  });

  it("un terme org devient un forcé de l'envoi comme un terme personnel", () => {
    const org = makeCoffreTerm("Projet-Basilic", "ORG");
    const forced = coffreToForced(combinedCoffre({ orgCoffre: [org] }));
    expect(forced).toEqual([{ value: "Projet-Basilic", category: "ORG" }]);
  });
});
