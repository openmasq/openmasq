// Le cas qui justifie ce fichier : l'app lancée depuis le Finder n'a PAS le PATH du
// shell, donc une détection qui s'y fie marche en dev et échoue chez l'utilisateur.
import { describe, expect, it } from "vitest";
import { candidatePaths, resolveCli } from "./resolveCli";

const mac = { platform: "darwin" as NodeJS.Platform, home: "/Users/x" };

describe("candidatePaths", () => {
  it("trouve claude sans AUCUN PATH — le cas du lancement Finder", () => {
    const out = candidatePaths("claude", mac);
    expect(out).toContain("/Users/x/.local/bin/claude");
    expect(out).toContain("/opt/homebrew/bin/claude");
  });

  it("donne la priorité au PATH quand il existe", () => {
    const out = candidatePaths("claude", { ...mac, path: "/custom/bin:/usr/bin" });
    expect(out[0]).toBe("/custom/bin/claude");
  });

  it("ignore les entrées de PATH relatives — un vecteur, pas une install", () => {
    const out = candidatePaths("claude", { ...mac, path: "./bin:/usr/bin" });
    expect(out.some((p) => p.startsWith("./"))).toBe(false);
  });

  it("ne rend jamais deux fois le même chemin", () => {
    const out = candidatePaths("claude", { ...mac, path: "/usr/local/bin" });
    expect(new Set(out).size).toBe(out.length);
  });

  it("essaie les extensions Windows — un binaire npm y est un .cmd", () => {
    const out = candidatePaths("codex", { platform: "win32", home: "C:\\Users\\x" });
    expect(out.some((p) => p.endsWith("codex.cmd"))).toBe(true);
  });
});

describe("resolveCli", () => {
  it("rend le premier candidat exécutable", () => {
    const found = resolveCli("claude", mac, (p) => p === "/opt/homebrew/bin/claude");
    expect(found).toBe("/opt/homebrew/bin/claude");
  });

  it("rend null quand la CLI est absente — un état normal, pas une erreur", () => {
    expect(resolveCli("gemini", mac, () => false)).toBeNull();
  });
});
