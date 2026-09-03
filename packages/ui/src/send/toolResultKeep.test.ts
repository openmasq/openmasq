import { describe, it, expect } from "vitest";
import { wireClearKeep, toolResultKeep } from "./toolResultKeep";
import { makeRedactToolResult, type RedactToolResultDeps } from "./toolResult";
import type { Host } from "../host";
import type { Settings } from "../types";
import type { Vault } from "@openmasq/redact";

describe("wireClearKeep — la garde de cohérence « déjà en clair sur le wire »", () => {
  it("spares a value present in a wire USER turn AND in the result", () => {
    const keep = wireClearKeep(
      '{"matches":[{"name":"Halden","path_display":"/Halden"}]}',
      ["Ma question porte sur le dossier « Halden » stocké sur Dropbox."],
      [],
    );
    expect(keep).toContain("halden");
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
    expect(wireClearKeep("aucun recoupement ici", ["le dossier Halden"], [])).not.toContain("halden");
    expect(wireClearKeep("", ["le dossier Halden"], [])).toEqual([]);
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
    const keep = toolResultKeep("dropbox__search", '{"name":"Halden","org":"Acme"}', {
      engineKeep: ["Stripe"],
      vaultValues: ["Acme"],
      wireUserTexts: ["le dossier Halden de Acme"],
      protectedValues: [],
    });
    expect(keep).toContain("Stripe");
    expect(keep).toContain("halden");
    expect(keep.map((k) => k.toLowerCase())).not.toContain("acme"); // vault REAL, never spared
  });
});

// ── The pinned scenario (log 26/08): « Halden » in clear in the message (the NER saw
// nothing there), the model searches for « Halden », Dropbox replies « Halden » — and the
// result pass was redacting it to « Basile », so the model concluded « no match ». The
// result must hand the model back the value it ALREADY received in clear; Coffre always wins.
describe("makeRedactToolResult + wireUserTexts (scénario Halden)", () => {
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
    // The NER (stub) this time detects « Halden » in the result — the bug's asymmetry.
    detectLocalFn: async () => [{ value: "Halden", category: "name" }],
    toolKinds: {},
    ...over,
  });
  const dropboxResult =
    '{"matches":[{"match_type":"FILENAME","name":"Halden","path_display":"/Halden"}],"total_results":1}';
  const wire = ["Ma question porte sur le dossier « Halden » stocké sur Dropbox.\n\nexplique le contenu"];

  it("a value already IN CLEAR on this send's wire stays clear in the result (no fake minted)", async () => {
    const vault: Vault = {};
    const redact = makeRedactToolResult(deps({ wireUserTexts: wire }));
    const out = await redact(dropboxResult, vault, "dropbox__search");
    expect(out).toContain("Halden"); // the model sees the value it searched for
    expect(Object.values(vault)).not.toContain("Halden"); // no incoherent mapping minted
  });

  it("counterfactual: with no wire echo, the same result is still redacted (the guard is the cause)", async () => {
    const vault: Vault = {};
    const redact = makeRedactToolResult(deps());
    const out = await redact(dropboxResult, vault, "dropbox__search");
    expect(out).not.toContain("Halden");
    expect(Object.values(vault)).toContain("Halden"); // faked + reversible, as before
  });

  it("COFFRE wins over coherence: a forced value is redacted even when the wire holds it in clear", async () => {
    const vault: Vault = {};
    const redact = makeRedactToolResult(
      deps({ wireUserTexts: wire, forced: [{ value: "Halden", category: "name" }] }),
    );
    const out = await redact(dropboxResult, vault, "dropbox__search");
    expect(out).not.toContain("Halden");
    expect(Object.values(vault)).toContain("Halden");
  });
});
