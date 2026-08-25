import { describe, it, expect } from "vitest";
import type { LocalFsEntry } from "../host";
import {
  isWithin,
  rootOf,
  sortEntries,
  visibleEntries,
} from "./localFsPaths";

const dir = (name: string, path: string): LocalFsEntry => ({
  name,
  path,
  kind: "dir",
  size: 0,
  mtime: 0,
});
const file = (name: string, path: string, size = 10): LocalFsEntry => ({
  name,
  path,
  kind: "file",
  size,
  mtime: 1,
});

describe("appartenance — un chemin est dans une racine accordée, ou il n'y est pas", () => {
  const roots = ["/Users/t/Docs", "/Users/t/Projets"];

  it("un chemin hors de toute racine accordée n'appartient à aucune", () => {
    expect(rootOf("/etc/ssh", roots)).toBeNull();
  });

  it("la racine retenue est la PLUS PROCHE quand des grants sont imbriqués", () => {
    const nested = ["/Users/t/Docs", "/Users/t/Docs/Projets"];
    expect(rootOf("/Users/t/Docs/Projets/a", nested)).toBe("/Users/t/Docs/Projets");
  });

  it("`isWithin` compare des segments, pas des préfixes de chaîne", () => {
    expect(isWithin("/a/b", "/a/b/c")).toBe(true);
    expect(isWithin("/a/b", "/a/b")).toBe(true);
    expect(isWithin("/a/b", "/a/bc")).toBe(false);
  });

  it("un chemin Windows se lit avec ses propres séparateurs", () => {
    const win = ["C:\\Users\\t\\Docs"];
    expect(rootOf("C:\\Users\\t\\Docs\\2026", win)).toBe("C:\\Users\\t\\Docs");
    expect(isWithin("C:\\Users\\t\\Docs", "C:\\Users\\t\\Docsbis")).toBe(false);
  });
});

describe("affichage du listing", () => {
  it("dossiers d'abord, puis A→Z sans tenir compte des accents ni de la casse", () => {
    const sorted = sortEntries([
      file("zebre.txt", "/a/zebre.txt"),
      dir("Élan", "/a/Élan"),
      file("Abeille.txt", "/a/Abeille.txt"),
      dir("abri", "/a/abri"),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["abri", "Élan", "Abeille.txt", "zebre.txt"]);
  });

  it("masque les fichiers cachés par défaut", () => {
    const entries = [file(".DS_Store", "/a/.DS_Store"), file("note.txt", "/a/note.txt")];
    expect(visibleEntries(entries).map((e) => e.name)).toEqual(["note.txt"]);
  });

  it("mais une recherche explicite les retrouve — l'utilisateur les a demandés", () => {
    const entries = [file(".env", "/a/.env"), file("note.txt", "/a/note.txt")];
    expect(visibleEntries(entries, { query: "env", showHidden: true }).map((e) => e.name)).toEqual([
      ".env",
    ]);
  });
});
