import { describe, it, expect } from "vitest";
import { adoptSettings, reconcileDbSettings } from "./settingsReconcile";
import { DEFAULT_SETTINGS } from "../storePersistence";
import type { Settings } from "../../types";

type Cats = Settings["redactCategories"];
const cats = (over: Partial<Cats>): Cats => ({ ...DEFAULT_SETTINGS.redactCategories, ...over });
const base = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });

describe("reconcileDbSettings", () => {
  it("returns current unchanged when the DB has no settings blob", () => {
    const adopted = base();
    expect(reconcileDbSettings(adopted, adopted, null)).toBe(adopted);
    expect(reconcileDbSettings(adopted, adopted, undefined)).toBe(adopted);
  });

  it("takes the DB blob when settings are UNTOUCHED since adoption", () => {
    const adopted = base({ redactCategories: cats({ name: true }) });
    const out = reconcileDbSettings(adopted, adopted, { redactCategories: cats({ name: false }) });
    // DB (source of truth across reloads) wins on a clean adoption.
    expect(out.redactCategories.name).toBe(false);
  });

  it("does NOT clobber an edit made during the async DB load (the onboarding bug)", () => {
    const adopted = base({ redactCategories: cats({ name: true, email: false }) });
    // The user toggled a category after adoption but before the DB hydrate resolved:
    const edited = base({ redactCategories: cats({ name: true, email: true }) });
    // Stale DB blob still has the pre-onboarding categories (email off).
    const out = reconcileDbSettings(edited, adopted, { redactCategories: cats({ email: false }) });
    // The user's fresh choice is preserved, not overwritten by the DB blob.
    expect(out).toBe(edited);
    expect(out.redactCategories.email).toBe(true);
  });
});

describe("adoptSettings — the theme follows the DEVICE, not the account", () => {
  it("KEEPS the device theme when signing OUT, ignoring the stale unscoped blob", () => {
    // The unscoped blob stops being written the moment an account signs in, so it
    // still holds whatever theme predated the account. Adopting it is what stripped
    // the user's blue mode the instant they logged out.
    const out = adoptSettings(null, { theme: "light" }, "blue-dark");
    expect(out.theme).toBe("blue-dark");
  });

  it("falls back to the blob, then the default, when the device never recorded one", () => {
    expect(adoptSettings(null, { theme: "blue-dark" }, undefined).theme).toBe("blue-dark");
    expect(adoptSettings(null, {}, undefined).theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it("still honours the ACCOUNT's own theme when signing IN", () => {
    // Signing in is adopting someone's stored preferences — that is not the bug.
    expect(adoptSettings("user-a", { theme: "blue" }, "blue-dark").theme).toBe("blue");
  });

  it("un accent VERT hérité est traduit, pas conservé — l'axe qui reste est le fond", () => {
    // `normalizeSettings` (→ `blueAccent`) is the only place that decides this; here
    // we verify that adoption doesn't bypass it, which is why it keeps its value.
    expect(adoptSettings(null, { theme: "dark" }, undefined).theme).toBe("blue-dark");
    expect(adoptSettings("user-a", { theme: "light" }, "blue-dark").theme).toBe("blue");
  });

  it("adopts the account blob over the defaults for everything else", () => {
    const out = adoptSettings("user-a", { onboarded: true, defaultModelId: "m1" }, "dark");
    expect(out.onboarded).toBe(true);
    expect(out.defaultModelId).toBe("m1");
    expect(out.redactCategories).toEqual(DEFAULT_SETTINGS.redactCategories);
  });

  it("does not leak the signed-out theme rule into a signed-in adoption with no theme", () => {
    // No theme stored for the account: the device's is the only sensible value, and
    // it is what is already on screen.
    expect(adoptSettings("user-a", {}, "blue-dark").theme).toBe(DEFAULT_SETTINGS.theme);
  });
});
