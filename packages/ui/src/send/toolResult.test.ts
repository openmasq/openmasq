import { afterEach, describe, it, expect, vi } from "vitest";
import { makeRedactToolResult, type RedactToolResultDeps } from "./toolResult";
import type { Host } from "../host";
import type { Settings } from "../types";
import type { Vault } from "@openmasq/redact";

// One mask for both fail-closed paths (server/AI): the distinction was internal
// jargon, and « changez de moteur » pointed at a setting that no longer exists.
const MASK_SERVER = "[Résultat de l'outil masqué : le redaction a échoué, rien n'est parti en clair. Réessayez.]";
const MASK_AI = MASK_SERVER;

const settings = (over: Partial<Settings> = {}): Settings =>
  ({ redactEngine: "patterns", redactNumbers: false, redactCategories: {}, ...over }) as Settings;

function deps(over: Partial<RedactToolResultDeps> = {}): RedactToolResultDeps {
  return {
    // The send's engine context — the same shape `sendMessage` builds
    // (`SendEngineContext`), so the harness exercises the real contract.
    engine: {
      disabledKinds: [],
      keep: [],
      avoid: undefined,
      kinds: {},
      salt: 0,
      mode: "fake",
      commercialNotoriety: false,
      peopleNotoriety: true,
    },
    useRemote: false,
    useAiDetect: false,
    useModel: false,
    useLocal: false,
    settings: settings(),
    host: {} as Host,
    extraSecrets: [],
    forced: [],
    completeFn: undefined,
    detectLocalFn: undefined,
    toolKinds: {},
    ...over,
  };
}

describe("makeRedactToolResult", () => {
  it("patterns engine: redacts free-form structured PII (an email) + records its kind", () => {
    const toolKinds: Record<string, string> = {};
    const redact = makeRedactToolResult(deps({ toolKinds }));
    return redact("contacter jean@example.com", {} as Vault).then((out) => {
      expect(out).not.toContain("jean@example.com"); // faked
      expect(toolKinds["jean@example.com"]).toBeTruthy(); // kind recorded for the audit
    });
  });

  it("COFFRE: a forced value in a tool result is masked + reversible, even when the user never typed it (audit)", async () => {
    // The Coffre's contract is "toujours redacted, quelle que soit la source" — but the
    // tool-result redactor used to receive NO forced list, so a Coffre value surfacing
    // in a Gmail/CRM result reached the model in CLEAR while the Coffre page showed it
    // protected.
    const vault: Vault = {};
    const redact = makeRedactToolResult(
      deps({ forced: [{ value: "Nightingale", category: "ORG" }] }),
    );
    const out = await redact("Le dossier Nightingale est prêt (réf. nightingale-22).", vault);
    expect(out).not.toMatch(/nightingale/i); // masked in every casing
    expect(Object.values(vault).some((v) => /nightingale/i.test(v))).toBe(true); // reversible
  });

  it("FAIL-CLOSED (remote, no token): masks the whole result — never regex-downgrades", async () => {
    // useRemote but the session has no access token → the remote engine can't run.
    const host = { auth: { getAccessToken: async () => null } } as unknown as Host;
    const redact = makeRedactToolResult(deps({ useRemote: true, host }));
    const out = await redact("un email jean@example.com et un nom Julien Sabourdin", {} as Vault);
    expect(out).toBe(MASK_SERVER); // opaque placeholder, NOT a regex-only leak
  });

  it("FAIL-CLOSED (AI detector threw): masks rather than leak names/orgs", async () => {
    // useModel with a completeFn that throws → pseudonymize sets modelError → mask.
    const redact = makeRedactToolResult(
      deps({
        useModel: true,
        useAiDetect: true,
        completeFn: async () => {
          throw new Error("model unreachable");
        },
      }),
    );
    const out = await redact("le client s'appelle Julien Sabourdin", {} as Vault);
    expect(out).toBe(MASK_AI);
  });

  it("caps a huge result before redaction (perf) — the dropped tail never reaches the model", async () => {
    const redact = makeRedactToolResult(deps());
    const huge = "x".repeat(20_000);
    const out = await redact(huge, {} as Vault);
    expect(out).toContain("[… résultat tronqué pour la performance]");
    expect(out.length).toBeLessThan(huge.length);
  });

  it("caps a BROWSER result tighter (8k) than a normal one (16k)", async () => {
    const redact = makeRedactToolResult(deps());
    const text = "y".repeat(10_000); // between the two caps
    expect(await redact(text, {} as Vault, "browser__browser_snapshot")).toContain("tronqué");
    expect(await redact(text, {} as Vault, "gmail__list_messages")).not.toContain("tronqué");
  });

  it("run_python: KEEPS a mis-flagged library name in clear, still redacted a real name", async () => {
    // A detector (here the local path) hallucinates `scipy` as a company — exactly the
    // reported bug. On the run_python tool the framework keep-list must spare it (else the
    // vault gets scipy→<fake> and the NEXT run's code + later tool calls get corrupted),
    // while a genuine name the code printed MUST still be faked (leak-safe).
    const detectLocalFn = async () => [
      { value: "scipy", category: "company" },
      { value: "Julien", category: "name" },
    ];
    const redact = makeRedactToolResult(
      deps({ useLocal: true, useAiDetect: true, detectLocalFn }),
    );
    const out = await redact("ImportError in scipy — client Julien", {} as Vault, "run_python");
    expect(out).toContain("scipy"); // framework token kept in clear
    expect(out).not.toContain("Julien"); // real PII still redacted
  });

  it("the SAME mis-flag on a NON-python tool is NOT spared (keep-list is python-scoped)", async () => {
    const detectLocalFn = async () => [{ value: "scipy", category: "company" }];
    const redact = makeRedactToolResult(
      deps({ useLocal: true, useAiDetect: true, detectLocalFn }),
    );
    const out = await redact("mentions scipy", {} as Vault, "gmail__list_messages");
    expect(out).not.toContain("scipy"); // outside run_python, the detection stands
  });
});

describe("memory_search — les entités des cartes sont du PII CONNU (forced scopé)", () => {
  const mem = [{ value: "Atelier Torbel", category: "ORG" }];

  it("redacted l'entité d'une carte dans le RÉSULTAT memory_search, même sous le moteur regex", async () => {
    // The patterns engine doesn't detect a free-form name: without the scoped forced,
    // the memory search result was reaching the model in CLEAR (measured in eval).
    const vault: Vault = {};
    const redact = makeRedactToolResult(deps({ memorySearchForced: mem }));
    const out = await redact("Souvenirs correspondants :\nAtelier Torbel (organisation) : paie en retard.", vault, "memory_search");
    expect(out).not.toMatch(/atelier torbel/i);
    expect(Object.values(vault)).toContain("Atelier Torbel"); // reversible
  });

  it("ne force PAS ces entités pour un AUTRE outil (SEARCH_CLEAR intact)", async () => {
    const redact = makeRedactToolResult(deps({ memorySearchForced: mem }));
    const out = await redact("Résultat web : Atelier Torbel est une agence réputée.", {} as Vault, "search__web_search");
    expect(out).toMatch(/atelier torbel/i); // the public web's policy stays unchanged
  });
});

describe("handshake de contrat (remote) — une option ignorée dont l'ignorance fuit", () => {
  afterEach(() => vi.unstubAllGlobals());
  const host = { auth: { getAccessToken: async () => "jwt" } } as unknown as Host;

  it("Strict + serveur sans `honored` → résultat MASQUÉ (jamais le sous-redacted)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ redacted: "sous-redacted avec Einstein en clair", matches: [], vault: {} }),
      })),
    );
    const d = deps({ useRemote: true, host });
    d.engine.peopleNotoriety = false; // the Strict level
    const out = await makeRedactToolResult(d)("Albert Einstein a répondu.", {} as Vault);
    expect(out).toContain("masqué");
    expect(out).not.toContain("Einstein");
  });

  it("Strict + serveur qui honore `peopleNotoriety` → le résultat passe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ redacted: "redacted serveur", matches: [], vault: {}, honored: ["peopleNotoriety"] }),
      })),
    );
    const d = deps({ useRemote: true, host });
    d.engine.peopleNotoriety = false;
    const out = await makeRedactToolResult(d)("texte", {} as Vault);
    expect(out).toBe("redacted serveur");
  });

  it("hors Strict, un vieux serveur ne bloque rien (l'ignorance n'y fuit pas)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ redacted: "redacted serveur", matches: [], vault: {} }),
      })),
    );
    const out = await makeRedactToolResult(deps({ useRemote: true, host }))("texte", {} as Vault);
    expect(out).toBe("redacted serveur");
  });
});

describe("many — N résultats du même outil en UNE passe moteur", () => {
  it("redacted chaque texte, attribue chacun au bon appel, identité atomique (même valeur ⇒ même faux)", async () => {
    const vault: Vault = {};
    const redact = makeRedactToolResult(deps());
    const [a, b] = await redact.many(
      ["le premier texte du lot mentionne jean@example.com", "le second texte du lot mentionne aussi jean@example.com"],
      vault,
    );
    expect(a).toContain("premier texte du lot"); // never a misattribution of the parts
    expect(b).toContain("second texte du lot");
    expect(a).not.toContain("jean@example.com");
    expect(b).not.toContain("jean@example.com");
    const fake = Object.keys(vault).find((k) => vault[k] === "jean@example.com");
    expect(fake).toBeTruthy(); // reversible
    expect(a).toContain(fake!); // ONE identity for both results of the batch
    expect(b).toContain(fake!);
  });

  it("cappe CHAQUE texte individuellement — le second texte d'un lot n'est jamais avalé par un cap du blob", async () => {
    const redact = makeRedactToolResult(deps());
    const [a, b] = await redact.many(["A".repeat(20_000), "B".repeat(20_000)], {} as Vault);
    expect(a).toContain("tronqué");
    expect(b).toContain("tronqué");
    expect(b).toContain("BBB"); // text 2 survived the cap (regression `precapped`)
  });

  it("FAIL-CLOSED en lot : détecteur IA en panne ⇒ CHAQUE partie masquée seule, jamais un blob mélangé", async () => {
    const redact = makeRedactToolResult(
      deps({
        useModel: true,
        completeFn: async () => {
          throw new Error("détecteur indisponible");
        },
      }),
    );
    const out = await redact.many(["un nom Alice Morvan", "un autre Bob Savary"], {} as Vault);
    expect(out).toEqual([MASK_AI, MASK_AI]);
  });
});
