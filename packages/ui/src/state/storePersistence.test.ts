import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, clearStuckPending, normalizeSettings, stripUserContentForLocal } from "./storePersistence";
import { blueAccent } from "./theme";
import type { Settings } from "../types";

/** A settings blob as an OLDER build would have written it, with the five toggles
 *  that no longer exist still on it. `as unknown as Settings` because that is the
 *  point: these keys are gone from the type but can still be on disk. */
const legacy = (over: Record<string, unknown>): Settings =>
  ({ ...DEFAULT_SETTINGS, ...over }) as unknown as Settings;

describe("normalizeSettings — legacy toggles are stripped (rule 7: no fail-open revival)", () => {
  it("drops a persisted `redactSensitive: false` — redaction has no off switch", () => {
    const out = normalizeSettings(legacy({ redactSensitive: false }));
    expect("redactSensitive" in out).toBe(false);
  });

  it("drops the other four retired toggles whatever their persisted value", () => {
    const out = normalizeSettings(
      legacy({
        restoreInReply: false,
        sendPreview: false,
        pythonEnabled: false,
        toolProgressSummaries: false,
      }),
    );
    for (const k of ["restoreInReply", "sendPreview", "pythonEnabled", "toolProgressSummaries"]) {
      expect(k in out).toBe(false);
    }
  });

  it("still strips the plaintext key blobs it already guarded", () => {
    const out = normalizeSettings(legacy({ apiKeys: { openai: "sk-real" }, redactModelApiKey: "sk-x" }));
    expect("apiKeys" in out).toBe(false);
    expect("redactModelApiKey" in out).toBe(false);
    // A stripped blob must not survive anywhere in the serialised settings.
    expect(JSON.stringify(out)).not.toMatch(/sk-real|sk-x/);
  });

  it("coerces the removed OFF-DEVICE engines to the on-device NER (rule 7: no off-device detection with no UI to change it)", () => {
    // "remote" (cloud) and "model" (BYO-key) were removed — a blob that still carries
    // one must route detection on-device, not keep the old (now unpickable) choice.
    for (const engine of ["remote", "model"] as const) {
      expect(normalizeSettings(legacy({ redactEngine: engine })).redactEngine).toBe("local");
    }
    // The purely-local engines are LEFT alone: "local" (NER) and "patterns" (regex)
    // both keep detection on the device.
    expect(normalizeSettings(legacy({ redactEngine: "local" })).redactEngine).toBe("local");
    expect(normalizeSettings(legacy({ redactEngine: "patterns" })).redactEngine).toBe("patterns");
    // A surviving non-engine redaction setting is untouched.
    expect(normalizeSettings(legacy({ redactNumbers: true })).redactNumbers).toBe(true);
  });

  it("clearStuckPending purge aussi « Mise en mémoire… » d'une session morte", () => {
    // An extraction that didn't survive the quit is dead: the frozen caption would lie.
    const out = clearStuckPending([
      {
        id: "c",
        title: "t",
        modelId: "m",
        createdAt: 0,
        updatedAt: 0,
        messages: [{ id: "a", role: "assistant", content: "…", memoryNotedPending: true }],
      } as never,
    ]);
    expect(out[0].messages[0].memoryNotedPending).toBeUndefined();
  });

  it("migre l'ancien défaut anglais du prompt système vers le défaut français", () => {
    // The old default ("You are a helpful assistant.") pulled the models' REASONING toward
    // English and, once the default changed, would pass for a CUSTOM prompt (a
    // detection pass paid on every send — `shouldRedactSystemPrompt`).
    const out = normalizeSettings(legacy({ systemPrompt: "You are a helpful assistant." }));
    expect(out.systemPrompt).toBe(DEFAULT_SETTINGS.systemPrompt);
    // The current default is indeed French, and a genuinely custom prompt survives.
    expect(DEFAULT_SETTINGS.systemPrompt).toBe("Tu es un assistant utile.");
    expect(normalizeSettings(legacy({ systemPrompt: "Réponds en vers." })).systemPrompt).toBe(
      "Réponds en vers.",
    );
  });

  it("jetons display defaults ON, and an explicit OFF survives the merge", () => {
    // A fresh account shows [PERSON1]-style tokens in the redacted views and the mark
    // hover card. The store's load path is `normalizeSettings({...DEFAULT_SETTINGS,
    // ...persistedBlob})` — mirrored verbatim here, in that order, because the claim is
    // about THAT merge: a pre-feature blob (no key) lands ON...
    expect(DEFAULT_SETTINGS.redactTokenDisplay).toBe(true);
    const preFeature = { ...legacy({}) } as Record<string, unknown>;
    delete preFeature.redactTokenDisplay;
    expect(
      normalizeSettings({ ...DEFAULT_SETTINGS, ...preFeature } as Settings).redactTokenDisplay,
    ).toBe(true);
    // ...while a user who deliberately turned it OFF keeps their choice.
    expect(
      normalizeSettings({ ...DEFAULT_SETTINGS, ...legacy({ redactTokenDisplay: false }) })
        .redactTokenDisplay,
    ).toBe(false);
  });

  it("backfills categories added after the blob was written", () => {
    const out = normalizeSettings(legacy({ redactCategories: { email: false } as Settings["redactCategories"] }));
    // The user's own override survives...
    expect(out.redactCategories.email).toBe(false);
    // ...and every catalog key the old blob predates is present.
    for (const k of Object.keys(DEFAULT_SETTINGS.redactCategories)) {
      expect(k in out.redactCategories).toBe(true);
    }
  });
});

describe("l'accent vert n'est plus une option", () => {
  it("traduit un thème persisté vers son jumeau indigo, en gardant le fond choisi", () => {
    // The BACKGROUND stays the person's choice; only the accent is imposed.
    expect(normalizeSettings(legacy({ theme: "light" })).theme).toBe("blue");
    expect(normalizeSettings(legacy({ theme: "dark" })).theme).toBe("blue-dark");
    expect(normalizeSettings(legacy({ theme: "blue" })).theme).toBe("blue");
    expect(normalizeSettings(legacy({ theme: "blue-dark" })).theme).toBe("blue-dark");
  });

  it("un réglage absent tombe sur l'indigo clair, pas sur le vert", () => {
    expect(blueAccent(undefined)).toBe("blue");
  });

  // This is THE trap of removing a toggle: without coercion on load, the
  // account that had green would keep it forever, with no surface to get out of it.
  it("le retrait de l'interrupteur ne fige personne sur l'ancien accent", () => {
    const vert = legacy({ theme: "dark" });
    expect(normalizeSettings(vert).theme).not.toBe("dark");
  });
});

describe("stripUserContentForLocal — l'org suit le même régime au repos que le personnel", () => {
  // F1: when the encrypted DB holds the settings, the plaintext localStorage copy
  // must carry NEITHER the personal coffre/compétences NOR their ORGANIZATION mirrors
  // (same content classes: real values, real pasted examples).
  const filled = (): Settings =>
    ({
      ...DEFAULT_SETTINGS,
      coffre: [{ id: "p1", value: "IBAN réel", token: "IBAN", createdAt: 1 }],
      orgCoffre: [{ id: "o1", value: "Projet-Basilic", token: "ORG", createdAt: 1 }],
      competences: [{ id: "c1", name: "Perso", prompt: "exemple réel", cat: "other", createdAt: 1 }],
      orgCompetences: [{ id: "oc1", name: "Org", prompt: "client réel", cat: "other", createdAt: 1 }],
    }) as unknown as Settings;

  it("avec une base chiffrée, les quatre listes sortent du blob en clair", () => {
    const out = stripUserContentForLocal(filled(), true);
    for (const k of ["coffre", "orgCoffre", "competences", "orgCompetences"]) {
      expect(k in out, k).toBe(false);
    }
    expect(JSON.stringify(out)).not.toMatch(/Projet-Basilic|IBAN réel|client réel/);
  });

  it("sans base (aperçu navigateur / mobile), tout reste — c'est le seul stockage", () => {
    const out = stripUserContentForLocal(filled(), false);
    expect(out.orgCoffre).toHaveLength(1);
    expect(out.orgCompetences).toHaveLength(1);
  });
});
