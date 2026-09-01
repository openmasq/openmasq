// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_STORAGE_PREFIX,
  migrateLegacyLocalStorage,
  resetLegacyStorageMigrationForTests,
} from "./legacyStorage";

// The fleet's real keys: the settings blob, its per-account variants (`:<uid>`),
// the theme… The pass is by PREFIX precisely so as not to hold a list that
// would forget the next key.
const legacy = (suffix: string): string => `${LEGACY_STORAGE_PREFIX}${suffix}`;

describe("migrateLegacyLocalStorage — le parc d'avant le renommage garde son état", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLegacyStorageMigrationForTests();
  });

  it("copie chaque clé de l'ancien préfixe vers l'actuel, variantes par compte comprises", () => {
    localStorage.setItem(legacy("settings"), '{"theme":"dark"}');
    localStorage.setItem(legacy("settings:u1"), '{"theme":"blue"}');
    localStorage.setItem(legacy("openTabs"), '["a","b"]');
    migrateLegacyLocalStorage();
    expect(localStorage.getItem("openmasq.settings")).toBe('{"theme":"dark"}');
    expect(localStorage.getItem("openmasq.settings:u1")).toBe('{"theme":"blue"}');
    expect(localStorage.getItem("openmasq.openTabs")).toBe('["a","b"]');
  });

  it("n'écrase JAMAIS une clé courante — la nouvelle build a raison sur la vieille", () => {
    localStorage.setItem(legacy("theme"), "dark");
    localStorage.setItem("openmasq.theme", "blue");
    migrateLegacyLocalStorage();
    expect(localStorage.getItem("openmasq.theme")).toBe("blue");
  });

  it("GARDE l'ancienne clé (un rollback de build retrouve son état)", () => {
    localStorage.setItem(legacy("theme"), "dark");
    migrateLegacyLocalStorage();
    expect(localStorage.getItem(legacy("theme"))).toBe("dark");
  });

  it("ignore les clés hors préfixe et reste une passe par session (idempotente)", () => {
    localStorage.setItem("autre.cle", "x");
    localStorage.setItem(legacy("theme"), "dark");
    migrateLegacyLocalStorage();
    // A write happening AFTER the pass must not be re-overwritten by a second call.
    localStorage.setItem("openmasq.theme", "blue");
    migrateLegacyLocalStorage();
    expect(localStorage.getItem("openmasq.theme")).toBe("blue");
    expect(localStorage.getItem("openmasq.cle")).toBeNull();
  });
});
