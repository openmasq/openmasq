import { describe, expect, it } from "vitest";
import { makeMemoryCard, normalizeMem } from "./memory";
import { filterNotoriousFromForced, memoryForced, selectMemory } from "./select";
import type { MemoryData } from "../types";

const card = (over: Partial<Parameters<typeof makeMemoryCard>[0]> & { entity: string; facts: string }) =>
  makeMemoryCard({ ...over })!;

function mem(): MemoryData {
  return {
    profile: "Consultant indépendant, clients PME françaises, répond en français.",
    cards: [
      card({ entity: "Augustin Vaudel", facts: "Client principal, préfère les points le jeudi.", cat: "personne", aliases: ["Vaudel", "augustin.vaudel@karl-studio.fr"] }),
      card({ entity: "Karl Studio", facts: "Agence de design à Évreux, devis Q3 signé (18 000 €).", cat: "organisation" }),
      card({ entity: "Projet Merlebleu", facts: "Refonte du site, deadline septembre.", cat: "projet" }),
    ],
  };
}

describe("selection — mention beats conversation-presence beats nothing", () => {
  it("a card is injected when the TYPED text mentions its entity (casing/accents-insensitive)", () => {
    const sel = selectMemory({ text: "fais un point sur KARL STUDIO", convValues: [], memory: mem() });
    expect(sel.cards.map((c) => c.entity)).toEqual(["Karl Studio"]);
    expect(sel.block).toContain("Karl Studio");
    expect(sel.block).toContain("Mémoire de l'utilisateur");
  });

  it("an ALIAS or fragment hits the card (« Vaudel » seul, or the e-mail address)", () => {
    for (const text of ["appelle Vaudel demain", "réponds à augustin.vaudel@karl-studio.fr"]) {
      const sel = selectMemory({ text, convValues: [], memory: mem() });
      expect(sel.cards.map((c) => c.entity)).toContain("Augustin Vaudel");
    }
  });

  it("an entity already present in the CONVERSATION keeps its card loaded (score 2)", () => {
    const sel = selectMemory({ text: "et pour la suite ?", convValues: ["Projet Merlebleu"], memory: mem() });
    expect(sel.cards.map((c) => c.entity)).toEqual(["Projet Merlebleu"]);
  });

  it("no signal ⇒ profile only; empty memory ⇒ inject NOTHING", () => {
    const sel = selectMemory({ text: "quelle heure est-il ?", convValues: [], memory: mem() });
    expect(sel.cards).toEqual([]);
    expect(sel.profile).toBeTruthy();
    expect(sel.block).toContain("Consultant indépendant");
    expect(selectMemory({ text: "bonjour", convValues: [], memory: { cards: [] } }).block).toBe("");
  });

  it("a short key never fires inside another word (no « art » in « Bakartis »)", () => {
    const m: MemoryData = { cards: [card({ entity: "Art", facts: "x", cat: "autre" })] };
    expect(selectMemory({ text: "la société Bakartis recrute", convValues: [], memory: m }).cards).toEqual([]);
    // …and the CONVERSATION tier obeys the same boundary: "Bakartis" in the vault
    // must not smuggle the « Art » card in as a substring.
    expect(selectMemory({ text: "et ensuite ?", convValues: ["Bakartis"], memory: m }).cards).toEqual([]);
  });

  it("a DISTINCTIVE token evokes the card (« Ninon » seule → « Ninon Verdolini »), ranked below a full mention", () => {
    const m: MemoryData = {
      cards: [
        card({ entity: "Ninon Verdolini", facts: "Cliente, dossier fiscal.", cat: "personne" }),
        card({ entity: "Karl Studio", facts: "Agence.", cat: "organisation" }),
      ],
    };
    const sel = selectMemory({ text: "appelle ninon demain au sujet de karl studio", convValues: [], memory: m });
    // full mention (score 3) first, token evocation (score 1) after
    expect(sel.cards.map((c) => c.entity)).toEqual(["Karl Studio", "Ninon Verdolini"]);
  });

  it("a GENERIC token alone never fires (« cabinet » must not inject « Cabinet Bezier »)", () => {
    const m: MemoryData = { cards: [card({ entity: "Cabinet Bezier", facts: "x", cat: "organisation" })] };
    expect(selectMemory({ text: "rendez-vous au cabinet demain", convValues: [], memory: m }).cards).toEqual([]);
    expect(selectMemory({ text: "rappelle bezier pour le devis", convValues: [], memory: m }).cards).toHaveLength(1);
  });

  it("an email/dotted alias matches whole-key only, never by fragment", () => {
    const m: MemoryData = {
      cards: [card({ entity: "Augustin Vaudel", facts: "x", cat: "personne", aliases: ["augustin.vaudel@karl-studio.fr"] })],
    };
    expect(selectMemory({ text: "un domaine en studio.fr", convValues: [], memory: m }).cards).toEqual([]);
  });

  it("a CJK entity is matched inside unsegmented text (2 glyphs = a full name)", () => {
    const m: MemoryData = { cards: [card({ entity: "张伟", facts: "Contact à Shanghai.", cat: "personne" })] };
    expect(selectMemory({ text: "请联系张伟先生", convValues: [], memory: m }).cards).toHaveLength(1);
    expect(normalizeMem("请联系张伟先生")).toContain("张伟");
    // ⚠️ ACCEPTED false positive, pinned so a change is deliberate: zh has no word
    // boundaries and we ship no segmenter, so « 王明 » also matches across the
    // 国王|明天 boundary. The cost is an extra injected card (re-redacted, budget-
    // capped) — accepted over missing every CJK mention (the redact engine makes the
    // same trade). Fixing this needs real segmentation, not a regex.
    const m2: MemoryData = { cards: [card({ entity: "王明", facts: "x", cat: "personne" })] };
    expect(selectMemory({ text: "国王明天到巴黎", convValues: [], memory: m2 }).cards).toHaveLength(1);
  });

  it("a name-noun HOMOGRAPH token never fires (« le marché est en pierre » ≠ Pierre Marché)", () => {
    const m: MemoryData = { cards: [card({ entity: "Pierre Marché", facts: "Client.", cat: "personne" })] };
    expect(selectMemory({ text: "le marché est en pierre", convValues: [], memory: m }).cards).toEqual([]);
    // The FULL name still recalls the card — the deny costs only the token shortcut.
    expect(selectMemory({ text: "rappelle pierre marché", convValues: [], memory: m }).cards).toHaveLength(1);
  });

  it("the token tier reads the TYPED text only — a conv value carrying a lone token stays score 0", () => {
    const m: MemoryData = { cards: [card({ entity: "Ninon Verdolini", facts: "x", cat: "personne" })] };
    expect(selectMemory({ text: "et ensuite ?", convValues: ["ninon"], memory: m }).cards).toEqual([]);
  });

  it("the budget cuts by (score, recency) — never a raw dump", () => {
    const m: MemoryData = {
      cards: Array.from({ length: 30 }, (_, i) =>
        card({ entity: `Client ${i} SA`, facts: "détails ".repeat(40), cat: "organisation" }),
      ),
    };
    const text = m.cards.map((c) => c.entity).join(", ");
    const sel = selectMemory({ text, convValues: [], memory: m, budgetChars: 1200 });
    expect(sel.cards.length).toBeGreaterThan(0);
    expect(sel.cards.length).toBeLessThan(10);
    expect(sel.block.length).toBeLessThan(2000);
  });

  it("une carte trop grosse pour le budget restant est SAUTÉE, jamais la file coupée", () => {
    // Same score, same recency down to the millisecond: the huge card comes first
    // (created second ⇒ updatedAt ≥). It blows the budget on its own; the two small ones
    // behind it fit and must be there — a break lost them all.
    const small1 = card({ entity: "Petit Client SA", facts: "Un fait court.", cat: "organisation" });
    const huge = card({ entity: "Énorme Dossier SA", facts: "détails ".repeat(70), cat: "organisation" });
    const small2 = card({ entity: "Autre Client SA", facts: "Un autre fait.", cat: "organisation" });
    const m: MemoryData = { cards: [small1, huge, small2] };
    const text = "Énorme Dossier SA, Petit Client SA, Autre Client SA";
    const sel = selectMemory({ text, convValues: [], memory: m, budgetChars: 300 });
    expect(sel.cards.map((c) => c.entity)).toEqual(
      expect.arrayContaining(["Petit Client SA", "Autre Client SA"]),
    );
    expect(sel.cards.map((c) => c.entity)).not.toContain("Énorme Dossier SA");
  });
});

describe("le non-rappel SURPRENANT est diagnostiqué — jamais le silence normal", () => {
  it("un hit direct écarté faute de place est consigné ; le simple non-mentionné jamais", () => {
    const big = card({ entity: "Gros Dossier SA", facts: "détails ".repeat(70), cat: "organisation" });
    const other = card({ entity: "Client Sans Rapport", facts: "x", cat: "organisation" });
    const m: MemoryData = { cards: [big, other] };
    const sel = selectMemory({ text: "où en est Gros Dossier SA ?", convValues: [], memory: m, budgetChars: 200 });
    expect(sel.cards).toEqual([]);
    expect(sel.skipped).toEqual([{ id: big.id, reason: "budget" }]); // jamais `other`
  });

  it("« appelle pierre » n'injecte pas « Pierre Marché » (homographe, exprès) — mais le DIT", () => {
    const pm = card({ entity: "Pierre Marché", facts: "Client fidèle.", cat: "personne" });
    const m: MemoryData = { cards: [pm] };
    const sel = selectMemory({ text: "appelle pierre demain matin", convValues: [], memory: m });
    expect(sel.cards).toEqual([]);
    expect(sel.block).toBe(""); // nothing is injected…
    expect(sel.skipped).toEqual([{ id: pm.id, reason: "homographe" }]); // …but it is said
    // The WHOLE name, itself, goes out normally — and with no stray diagnostic.
    const full = selectMemory({ text: "rappelle pierre marché", convValues: [], memory: m });
    expect(full.cards).toHaveLength(1);
    expect(full.skipped).toEqual([]);
  });

  it("une sélection ordinaire n'a rien à signaler", () => {
    expect(selectMemory({ text: "fais un point sur Karl Studio", convValues: [], memory: mem() }).skipped).toEqual([]);
  });
});

describe("the injection is protectable WITHOUT a detector", () => {
  it("memoryForced lists every selected entity + alias, e-mail alias as EMAIL", () => {
    const sel = selectMemory({ text: "un mot sur Augustin Vaudel", convValues: [], memory: mem() });
    const forced = memoryForced(sel);
    expect(forced).toEqual(
      expect.arrayContaining([
        { value: "Augustin Vaudel", category: "NAME" },
        { value: "Vaudel", category: "NAME" },
        { value: "augustin.vaudel@karl-studio.fr", category: "EMAIL" },
      ]),
    );
  });

  it("une entité/alias qui est un MOT DU LEXIQUE n'est jamais forcée — le bug « ashcombe »", () => {
    // Log 01/08: a failed extraction had filed « dossiers » as an organisation;
    // forced, it minted dossiers→ashcombe and the connector's error message reached the
    // model as « hors des ashcombe autorisés ». A word of the common lexicon is not
    // known PII — it must NEVER enter the vault through the memory forced list.
    const data: MemoryData = {
      profile: "",
      cards: [
        card({ entity: "dossiers", facts: "Fournisseurs listés ici.", cat: "organisation", aliases: ["frais"] }),
        card({ entity: "Karl Studio", facts: "L'entreprise de l'utilisateur.", cat: "organisation" }),
      ],
    };
    const sel = selectMemory({ text: "où sont mes dossiers Karl Studio ?", convValues: [], memory: data });
    const forced = memoryForced(sel);
    expect(forced.some((f) => f.value === "dossiers")).toBe(false);
    expect(forced.some((f) => f.value === "frais")).toBe(false);
    expect(forced).toEqual(expect.arrayContaining([{ value: "Karl Studio", category: "ORG" }]));
  });

  it("une entité FRAGMENT DE PHRASE (fiche corrompue existante) ne mint jamais de faux", () => {
    // Log 02/08: an inherited card « Les deux fichiers sont des… » (organisation)
    // became « Brightpath capitalshojojkxm » on every injection. The extraction guard
    // stops the new ones; this guard neutralises those already stored.
    const data: MemoryData = {
      profile: "",
      cards: [
        card({ entity: "Les deux fichiers sont des bilans prévisionnels", facts: "chiffres.", cat: "organisation" }),
        card({ entity: "Karl Studio", facts: "L'entreprise.", cat: "organisation" }),
      ],
    };
    const sel = selectMemory({ text: "parle-moi des deux fichiers de Karl Studio", convValues: [], memory: data });
    const forced = memoryForced(sel);
    expect(forced.some((f) => f.value.startsWith("Les deux fichiers"))).toBe(false);
    expect(forced).toEqual(expect.arrayContaining([{ value: "Karl Studio", category: "ORG" }]));
  });

  it("filterNotoriousFromForced retire une MARQUE notoire (alias fournisseur) quand le niveau l'épargne — le bug « Ostrel Drive »", () => {
    // The log of 30/07: the Karl Studio card carried « google » (a provider) as an
    // alias; forced, it minted google→ostrel despite the level's notoriety exemption,
    // and the vault rewrote the whole prompt — « Ostrel Drive », a connector the model
    // could not find.
    const forced = [
      { value: "Karl Studio", category: "ORG" }, // the user's company: stays forced
      { value: "google", category: "ORG" }, // notorious COMMERCIAL brand, breaks the memory fact
      { value: "augustin.vaudel@karl-studio.fr", category: "EMAIL" }, // never notorious → stays
    ];
    const spared = filterNotoriousFromForced(forced, { commercial: true, people: true });
    expect(spared).toEqual(
      expect.arrayContaining([
        { value: "Karl Studio", category: "ORG" },
        { value: "augustin.vaudel@karl-studio.fr", category: "EMAIL" },
      ]),
    );
    expect(spared.some((f) => f.value === "google")).toBe(false);
    // In STRICT mode (`commercial: false`), a COMMERCIAL brand is no longer spared by
    // detection — the forced list must therefore keep it: the protection stays whole. (The
    // unconditional set — countries, tickers, institutions — follows the engine, as in detection.)
    const strict = filterNotoriousFromForced(forced, { commercial: false, people: false });
    expect(strict).toEqual(forced);
  });
});

describe("memoryForcedForBlock — le PROFIL est couvert par le forced", () => {
  it("une entité de carte NON sélectionnée mais présente dans le bloc (profil) est forcée", async () => {
    const { memoryForcedForBlock } = await import("./select");
    const sel = {
      profile: "Directeur artistique chez Karl Studio.",
      cards: [],
      block: "Mémoire de l'utilisateur :\nDirecteur artistique chez Karl Studio.",
      skipped: [],
    };
    const memory = {
      cards: [{ id: "x", entity: "Karl Studio", cat: "organisation" as const, facts: "Employeur.", createdAt: 1, updatedAt: 1 }],
    };
    const forced = memoryForcedForBlock(sel, memory);
    expect(forced.map((f) => f.value)).toContain("Karl Studio");
  });
});

describe("memoryForced — un nom de fiche qui est un MOT DU LANGAGE n'est jamais forcé", () => {
  it("une note « dossiers » ne redacted pas le mot commun de toute la conversation", () => {
    // The measured case: the generic note force-redacted « dossiers », and « à quels
    // dossiers as-tu accès ? » went out mutilated (« à quels brantley… ») — question AND
    // memory search destroyed. A common word identifies nobody: no forced entry.
    const cards = [
      { entity: "dossiers", cat: "autre", text: "dossiers", aliases: [] },
      { entity: "Karl Studio", cat: "organisation", text: "…", aliases: ["karl"] },
    ] as never[];
    const forced = memoryForced({ profile: undefined, cards, block: "", skipped: [] } as never);
    const values = forced.map((f) => f.value);
    expect(values).not.toContain("dossiers");
    expect(values).toContain("Karl Studio");
  });

  it("un alias générique est écarté, l'alias distinctif reste", () => {
    const cards = [
      { entity: "Merova Labs", cat: "organisation", text: "…", aliases: ["notes", "merova"] },
    ] as never[];
    const values = memoryForced({ profile: undefined, cards, block: "", skipped: [] } as never).map((f) => f.value);
    expect(values).not.toContain("notes");
    expect(values).toContain("merova");
    expect(values).toContain("Merova Labs");
  });
});
