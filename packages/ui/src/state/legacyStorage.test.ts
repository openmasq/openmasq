// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_STORAGE_PREFIX,
  migrateLegacyLocalStorage,
  resetLegacyStorageMigrationForTests,
} from "./legacyStorage";

// Les clés réelles du parc : le blob de réglages, ses variantes par compte (`:<uid>`),
// le thème… La passe est par PRÉFIXE précisément pour ne pas tenir une liste qui
// oublierait la prochaine clé.
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
    // Une écriture POSTÉRIEURE à la passe ne doit pas être re-écrasée par un second appel.
    localStorage.setItem("openmasq.theme", "blue");
    migrateLegacyLocalStorage();
    expect(localStorage.getItem("openmasq.theme")).toBe("blue");
    expect(localStorage.getItem("openmasq.cle")).toBeNull();
  });
});
