import { describe, it, expect } from "vitest";
import { findModel } from "@openmasq/llm";
import { CATEGORY_HUE } from "@openmasq/redact";
import { MODEL_CATALOG, findCatalogModel } from "./models";
import { MCP_CONNECTORS, findConnector, connectorIdFromInstance } from "./mcp";
import {
  REDACTION_CATEGORIES,
  REDACTION_CATEGORY_GROUPS,
  REDACTION_GROUP_TONE,
  RETIRED_CATEGORIES,
  CATEGORY_DEFAULTS,
  type RedactionCategory,
} from "./redaction";

describe("model catalog", () => {
  it("every model resolves in the llm registry", () => {
    for (const m of MODEL_CATALOG) {
      expect(findModel(m.id), `${m.id} missing from @openmasq/llm MODELS`).toBeTruthy();
    }
  });

  it("contains no keyless web-session models (removed from the product)", () => {
    // The desktop/mobile product is API-key only; session providers must never
    // appear in the catalog the picker/admin console list.
    for (const m of MODEL_CATALOG) {
      expect(m.provider).not.toMatch(/-session$/);
    }
  });

  it("findCatalogModel round-trips every id", () => {
    for (const m of MODEL_CATALOG) {
      expect(findCatalogModel(m.id)?.id).toBe(m.id);
    }
  });

  it("propagates the registry's capability flags (vision/noTools)", () => {
    // The registry's ONLY two capability flags used to be DROPPED by the flatten,
    // so a catalog consumer couldn't tell a vision model from a text-only one.
    for (const m of MODEL_CATALOG) {
      const raw = findModel(m.id)!;
      expect(m.vision, `${m.id} vision`).toBe(raw.vision ? true : undefined);
      expect(m.noTools, `${m.id} noTools`).toBe(raw.noTools ? true : undefined);
    }
  });
});

describe("mcp catalog", () => {
  it("has unique ids", () => {
    const ids = MCP_CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("findConnector round-trips", () => {
    expect(findConnector("filesystem")?.transport).toBe("stdio");
    // Merged Gmail is a desktop-direct connector (its priority beats the legacy
    // broker `gmail` entry in the dedupe).
    expect(findConnector("gmail")?.transport).toBe("direct");
    expect(findConnector("notion")?.transport).toBe("remote");
  });

  it("the two Gmail connectors are merged into one `gmail`", () => {
    expect(findConnector("gmail-send")).toBeUndefined();
    expect(findConnector("gmail-read")).toBeUndefined();
    const gmail = findConnector("gmail");
    expect(gmail?.transport).toBe("direct");
    expect(gmail?.byoOnly).toBeFalsy();
    // 30/07/2026: 1-click capabilities = 100% of byo — read + send in BOTH modes.
    const full = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ];
    expect(gmail?.scopes?.managed).toEqual(full);
    expect(gmail?.scopes?.byo).toEqual(full);
  });

  it("les connecteurs Google offrent 100 % de leurs capacités en 1-clic (managed ≡ byo)", () => {
    // Product decision 30/07/2026: no Google scope is reserved for byo anymore — CASA is
    // an ops prerequisite (client verification), never a gate in the code.
    for (const id of ["gmail", "google-calendar", "google-drive", "google-docs", "google-sheets", "google-tasks", "google-analytics"]) {
      const c = findConnector(id);
      expect(c?.byoOnly, id).toBeFalsy();
      expect(c?.scopes?.managed, id).toEqual(c?.scopes?.byo);
      expect((c?.scopes?.managed ?? []).length, id).toBeGreaterThan(0);
    }
  });

  it("resolves a multi-account instance id to its connector", () => {
    expect(connectorIdFromInstance("gmail--a1b2c3")).toBe("gmail");
    expect(connectorIdFromInstance("google-calendar")).toBe("google-calendar");
    expect(connectorIdFromInstance("gmail")).toBe("gmail");
    expect(findConnector("gmail--a1b2c3")?.id).toBe("gmail");
    expect(findConnector("google-calendar--ff00aa")?.id).toBe("google-calendar");
  });

  it("Fireflies is a one-click OAuth/DCR remote connector (no longer API-key)", () => {
    const ff = findConnector("fireflies");
    expect(ff?.transport).toBe("remote");
    expect(ff?.auth).toBeUndefined(); // default "oauth" (DCR one-click)
    expect(ff?.url).toBe("https://api.fireflies.ai/mcp");
  });

  it("Exa is the only remaining API-key remote connector", () => {
    const apikeys = MCP_CONNECTORS.filter((c) => c.transport === "remote" && c.auth === "apikey").map((c) => c.id);
    expect(apikeys).toEqual(["exa"]);
  });

  it("every EMAIL connector names its send-email capability in its desc", () => {
    // `suggest_integrations` is picked from the desc, so a terse one ("Email & agenda")
    // made the model omit Superhuman for "envoie un mail" while proposing Gmail/Outlook.
    // Keep the send-email wording so all email connectors are suggested alike.
    for (const id of ["gmail", "microsoft-outlook", "superhuman"]) {
      const c = findConnector(id);
      expect(c, `${id} missing`).toBeTruthy();
      expect(c!.desc.toLowerCase(), `${id} desc must mention emails`).toContain("email");
      expect(c!.desc.toLowerCase(), `${id} desc must name the send capability`).toContain("envoyer");
    }
  });
});

describe("redaction catalog", () => {
  it("every category key is a valid RedactionCategory", () => {
    for (const c of REDACTION_CATEGORIES) {
      expect(CATEGORY_HUE[c.key], `${c.key} not a RedactionCategory`).toBeTruthy();
    }
  });

  it("defaults cover exactly the engine's category enum", () => {
    const defaultKeys = Object.keys(CATEGORY_DEFAULTS).sort();
    const hueKeys = Object.keys(CATEGORY_HUE).sort();
    expect(defaultKeys).toEqual(hueKeys);
  });

  it("AI (BETA) identity categories default ON — the product's promise holds out of the box", () => {
    // The home screen and the help site promise names/companies are protected. A default
    // that ships them OFF makes that copy false on every fresh install (the audited
    // trust gap). The default engine is the offline NER, so ON works with no setup.
    for (const key of ["name", "dob", "address", "location", "company"] as const) {
      expect(CATEGORY_DEFAULTS[key], `${key} must default ON`).toBe(true);
    }
  });

  it("noise-tier heuristics stay OFF by default (deliberate opt-in, not a data risk)", () => {
    for (const key of ["url", "username"] as const) {
      expect(CATEGORY_DEFAULTS[key], `${key} must default OFF`).toBe(false);
    }
  });

  // `apikey` has left that tier. It remains the catalogue's broadest heuristic —
  // it catches harmless product references, which is why it was OFF —
  // but its ABSENCE is a key going out in clear. So it belongs to the floor
  // that ALL protection levels share (`ALWAYS_ON`, `ui/privacy/privacyLevel.ts`),
  // reduced level included. A product decision, not a noise-tier setting.
  it("« Chaînes type clé » est ON par défaut — son manque est une clé en clair", () => {
    expect(CATEGORY_DEFAULTS.apikey, "apikey must default ON").toBe(true);
  });

  it("the catalog covers the engine's enum minus the retired categories", () => {
    const catalogKeys = REDACTION_CATEGORIES.map((c) => c.key).sort();
    const hueKeys = Object.keys(CATEGORY_HUE).sort();
    const exposable = hueKeys.filter((k) => !RETIRED_CATEGORIES.includes(k as RedactionCategory));
    expect(catalogKeys).toEqual(exposable);
  });

  // A retired category has no toggle on any surface, so it must be off wherever a
  // category can be turned on — otherwise it redacts with no way to stop it.
  it("a retired category is exposed nowhere and defaults OFF", () => {
    for (const key of RETIRED_CATEGORIES) {
      expect(REDACTION_CATEGORIES.some((c) => c.key === key), `${key} still listed`).toBe(false);
      expect(CATEGORY_DEFAULTS[key], `${key} must default OFF`).toBe(false);
    }
  });

  it("no group is left with no categories in it", () => {
    for (const group of REDACTION_CATEGORY_GROUPS) {
      expect(REDACTION_CATEGORIES.some((c) => c.group === group), `${group} is empty`).toBe(true);
    }
    for (const c of REDACTION_CATEGORIES) {
      expect(REDACTION_CATEGORY_GROUPS, `${c.key}'s group is unlisted`).toContain(c.group);
    }
  });

  // The rules-modal chips colour by SECTION, so a section with no swatch renders the
  // fallback and stops being distinguishable — the exact bug this map fixes. Keep the
  // group list and its colours in lockstep (rule 9: a parity test, not a comment).
  it("every section has its own chip colour, and vice-versa", () => {
    const groups = [...REDACTION_CATEGORY_GROUPS].sort();
    const toned = Object.keys(REDACTION_GROUP_TONE).sort();
    expect(toned, "REDACTION_GROUP_TONE must cover exactly the section list").toEqual(groups);
    // Each colour is a bare `var(--*)` reference (the chip mixes it in CSS).
    for (const [group, tone] of Object.entries(REDACTION_GROUP_TONE)) {
      expect(tone, `${group}'s tone must be a var(--*)`).toMatch(/^var\(--[a-z-]+\)$/);
    }
    // The colours must be DISTINCT — the whole point is one hue per section.
    const tones = Object.values(REDACTION_GROUP_TONE);
    expect(new Set(tones).size, "section colours must be distinct").toBe(tones.length);
  });
});
