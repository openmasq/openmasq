import { describe, it, expect } from "vitest";
import { wireClearKeep, toolResultKeep } from "./toolResultKeep";
import { makeRedactToolResult, type RedactToolResultDeps } from "./toolResult";
import type { Host } from "../host";
import type { Settings } from "../types";
import type { Vault } from "@openmasq/redact";

describe("wireClearKeep — la garde de cohérence « déjà en clair sur le wire »", () => {
  it("spares a value present in a wire USER turn AND in the result", () => {
    const keep = wireClearKeep(
      '{"matches":[{"name":"Numa","path_display":"/Numa"}]}',
      ["Ma question porte sur le dossier « Numa » stocké sur Dropbox."],
      [],
    );
    expect(keep).toContain("numa");
  });

  it("multi-word spans get their multi-word gram (isKept matches the exact span)", () => {
    const keep = wireClearKeep(
      "Contact: Jean Rebour <j@ex.fr>",
      ["parle-moi de Jean Rebour"],
      [],
    );
    expect(keep).toContain("jean rebour");
  });

  it("harvests NOTHING absent from the result, and nothing from empty inputs", () => {
    expect(wireClearKeep("aucun recoupement ici", ["le dossier Numa"], [])).not.toContain("numa");
    expect(wireClearKeep("", ["le dossier Numa"], [])).toEqual([]);
    expect(wireClearKeep("texte", [], [])).toEqual([]);
  });

  it("FAIL-CLOSED: a gram touching a protected value is dropped, both directions", () => {
    // survivor contains the protected value…
    expect(
      wireClearKeep("le dossier Jean Rebour", ["le dossier Jean Rebour"], ["Rebour"]),
    ).not.toContain("jean rebour");
    // …and the protected value contains the survivor.
    expect(
      wireClearKeep("un certain Rebour", ["un certain Rebour"], ["Jean Rebour"]),
    ).not.toContain("rebour");
  });
});

describe("toolResultKeep — merged per-call keep layers", () => {
  it("keeps the engine keep + the wire-clear harvest; vault reals are protected", () => {
    const keep = toolResultKeep("dropbox__search", '{"name":"Numa","org":"Acme"}', {
      engineKeep: ["Stripe"],
      vaultValues: ["Acme"],
      wireUserTexts: ["le dossier Numa de Acme"],
      protectedValues: [],
    });
    expect(keep).toContain("Stripe");
    expect(keep).toContain("numa");
    expect(keep.map((k) => k.toLowerCase())).not.toContain("acme"); // vault REAL, never spared
  });
});

// ── Le scénario épinglé (journal 26/08) : « Numa » en clair dans le message (le NER n'y a
// rien vu), le modèle cherche « Numa », Dropbox répond « Numa » — et la passe résultat le
// redact en « Basile », donc le modèle concluait « aucun rapport ». Le résultat doit
// rendre au modèle la valeur qu'il a DÉJÀ reçue en clair ; le Coffre, lui, gagne toujours.
describe("makeRedactToolResult + wireUserTexts (scénario Numa)", () => {
  const settings = { redactEngine: "patterns", redactNumbers: false, redactCategories: {} } as Settings;
  const deps = (over: Partial<RedactToolResultDeps> = {}): RedactToolResultDeps => ({
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
    useLocal: true,
    settings,
    host: {} as Host,
    extraSecrets: [],
    forced: [],
    completeFn: undefined,
    // Le NER (stub) détecte cette fois « Numa » dans le résultat — l'asymétrie du bug.
    detectLocalFn: async () => [{ value: "Numa", category: "name" }],
    toolKinds: {},
    ...over,
  });
  const dropboxResult =
    '{"matches":[{"match_type":"FILENAME","name":"Numa","path_display":"/Numa"}],"total_results":1}';
  const wire = ["Ma question porte sur le dossier « Numa » stocké sur Dropbox.\n\nexplique le contenu"];

  it("a value already IN CLEAR on this send's wire stays clear in the result (no fake minted)", async () => {
    const vault: Vault = {};
    const redact = makeRedactToolResult(deps({ wireUserTexts: wire }));
    const out = await redact(dropboxResult, vault, "dropbox__search");
    expect(out).toContain("Numa"); // the model sees the value it searched for
    expect(Object.values(vault)).not.toContain("Numa"); // no incoherent mapping minted
  });

  it("counterfactual: with no wire echo, the same result is still redacted (the guard is the cause)", async () => {
    const vault: Vault = {};
    const redact = makeRedactToolResult(deps());
    const out = await redact(dropboxResult, vault, "dropbox__search");
    expect(out).not.toContain("Numa");
    expect(Object.values(vault)).toContain("Numa"); // faked + reversible, as before
  });

  it("COFFRE wins over coherence: a forced value is redacted even when the wire holds it in clear", async () => {
    const vault: Vault = {};
    const redact = makeRedactToolResult(
      deps({ wireUserTexts: wire, forced: [{ value: "Numa", category: "name" }] }),
    );
    const out = await redact(dropboxResult, vault, "dropbox__search");
    expect(out).not.toContain("Numa");
    expect(Object.values(vault)).toContain("Numa");
  });
});
