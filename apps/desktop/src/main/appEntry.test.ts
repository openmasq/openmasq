import { describe, it, expect, vi } from "vitest";
import { BRAND } from "@openmasq/branding";

vi.mock("electron", () => ({ app: { isPackaged: false, getAppPath: () => "/app" } }));

const { helperEntryArgs } = await import("./appEntry");

describe("helperEntryArgs", () => {
  it("dev: passe le chemin ABSOLU de l'app à l'enfant", () => {
    expect(helperEntryArgs(false, "/Users/x/apps/desktop")).toEqual(["/Users/x/apps/desktop"]);
  });

  it("packagé: aucune entrée en argv (l'app bundlée se charge seule)", () => {
    expect(helperEntryArgs(true, `/Applications/${BRAND.name}.app/Contents/Resources/app.asar`)).toEqual([]);
  });

  // Regression: `require.main.filename` equals « electron » in Electron's main.
  // Spawned as-is, the child opened a native modal dialog « Unable to find
  // Electron app at <cwd>/electron » and never terminated.
  it("refuse un chemin relatif au lieu de spawner un enfant bloqué sur un dialogue", () => {
    expect(() => helperEntryArgs(false, "electron")).toThrow(/non absolu/);
    expect(() => helperEntryArgs(false, ".")).toThrow(/non absolu/);
  });
});
