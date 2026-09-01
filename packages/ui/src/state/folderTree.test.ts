import { describe, expect, it } from "vitest";
import type { LocalFsEntry } from "../host";
import { MAX_TREE_DEPTH, folderTreeRows, missingListings, toggleFolder } from "./folderTree";

/**
 * The flattening of the granted folders' tree.
 *
 * Two things are worth a test rather than a paragraph: an open folder whose listing
 * hasn't arrived yet must SAY so as in-progress (an empty folder and a not-yet-read
 * folder look alike on screen, and confusing the two makes the machine seem to lie),
 * and a link pointing to an ancestor must not be able to loop the render — the open
 * state being indexed by absolute path, this is expressible in three clicks.
 */

const dir = (path: string, name = path.split("/").pop()!): LocalFsEntry => ({
  name,
  path,
  kind: "dir",
  size: 0,
  mtime: 0,
});
const file = (path: string, name = path.split("/").pop()!): LocalFsEntry => ({
  name,
  path,
  kind: "file",
  size: 10,
  mtime: 0,
});

describe("folderTreeRows", () => {
  it("ne montre que les racines tant que rien n'est ouvert", () => {
    const rows = folderTreeRows(["/a", "/b"], {}, new Set());
    expect(rows.map((r) => r.entry.path)).toEqual(["/a", "/b"]);
    expect(rows.every((r) => r.depth === 0 && !r.expanded)).toBe(true);
  });

  it("déplie les enfants d'un dossier ouvert, dossiers d'abord", () => {
    const rows = folderTreeRows(
      ["/a"],
      { "/a": [file("/a/z.txt"), dir("/a/sub"), file("/a/a.txt")] },
      new Set(["/a"]),
    );
    expect(rows.map((r) => r.entry.path)).toEqual(["/a", "/a/sub", "/a/a.txt", "/a/z.txt"]);
    expect(rows.slice(1).every((r) => r.depth === 1)).toBe(true);
  });

  it("dit « en cours » plutôt que de faire passer un dossier non lu pour un dossier vide", () => {
    const [root] = folderTreeRows(["/a"], {}, new Set(["/a"]));
    expect(root.expanded).toBe(true);
    expect(root.loading).toBe(true);

    // Listing arrived and empty: it's no longer a loading state, it's an empty folder.
    const [read] = folderTreeRows(["/a"], { "/a": [] }, new Set(["/a"]));
    expect(read.loading).toBe(false);
  });

  it("un listing en cours de rafraîchissement reste marqué en cours", () => {
    const [root] = folderTreeRows(["/a"], { "/a": [] }, new Set(["/a"]), new Set(["/a"]));
    expect(root.loading).toBe(true);
  });

  it("ne déplie pas un dossier à l'intérieur de lui-même — le lien vers un ancêtre", () => {
    // `/a/boucle` is a link resolved by main to `/a`: same absolute path, so same
    // open state. Without the guard, the recursive walk would never stop.
    const rows = folderTreeRows(
      ["/a"],
      { "/a": [dir("/a", "boucle"), file("/a/note.md")] },
      new Set(["/a"]),
    );
    expect(rows.map((r) => r.entry.name)).toEqual(["a", "boucle", "note.md"]);
    expect(rows[1].expanded).toBe(false);
  });

  it("borne la profondeur rendue", () => {
    // A chain much deeper than the guard, entirely open.
    const listings: Record<string, LocalFsEntry[]> = {};
    let path = "/a";
    for (let i = 0; i < MAX_TREE_DEPTH + 5; i++) {
      const child = `${path}/d${i}`;
      listings[path] = [dir(child)];
      path = child;
    }
    const rows = folderTreeRows(["/a"], listings, new Set(Object.keys(listings)));
    expect(rows).toHaveLength(MAX_TREE_DEPTH);
    expect(Math.max(...rows.map((r) => r.depth))).toBe(MAX_TREE_DEPTH - 1);
  });
});

describe("toggleFolder / missingListings", () => {
  it("ouvre puis referme", () => {
    const once = toggleFolder(new Set(), "/a");
    expect([...once]).toEqual(["/a"]);
    expect([...toggleFolder(once, "/a")]).toEqual([]);
  });

  it("ne réclame que les listings que l'écran peut montrer", () => {
    // `/a/sub` is open but its parent isn't: it doesn't appear in any row, so the
    // rail must not pay for reading it.
    const expanded = new Set(["/a/sub"]);
    const rows = folderTreeRows(["/a"], {}, expanded);
    expect(missingListings(rows, {})).toEqual([]);

    const open = folderTreeRows(["/a"], { "/a": [dir("/a/sub")] }, new Set(["/a", "/a/sub"]));
    expect(missingListings(open, { "/a": [dir("/a/sub")] })).toEqual(["/a/sub"]);
  });
});

describe("folderTreeRows — un ÉCHEC n'est pas un chargement", () => {
  // The symptom we saw: a folder whose listing fails stayed on « … » forever,
  // which reads as a slow folder — so as a folder that doesn't render its
  // children. A failure has a cause, shown under the panel; it must SAY so.
  it("cesse de charger et se marque en échec", () => {
    const [row] = folderTreeRows(["/a"], {}, new Set(["/a"]), new Set(), new Set(["/a"]));
    expect(row.loading).toBe(false);
    expect(row.failed).toBe(true);
  });

  it("un dossier en échec n'est plus redemandé — sinon on boucle sur la même erreur", () => {
    const rows = folderTreeRows(["/a"], {}, new Set(["/a"]), new Set(), new Set(["/a"]));
    expect(missingListings(rows, {})).toEqual([]);
  });

  it("sans échec, rien ne change : un dossier ouvert et non lu charge", () => {
    const [row] = folderTreeRows(["/a"], {}, new Set(["/a"]));
    expect(row.loading).toBe(true);
    expect(row.failed).toBe(false);
  });
});

describe("chaque ligne a une clé UNIQUE — sans quoi un dossier ne se referme pas", () => {
  const d = (path: string, name: string) => ({ name, path, kind: "dir" as const, size: 0, mtime: 0 });
  const f = (path: string, name: string) => ({ name, path, kind: "file" as const, size: 0, mtime: 0 });

  // The real case: a remote storage returns a RECURSIVE listing, so the grandchild
  // arrives next to its parent. Two rows for the same path = the same React key
  // twice: collapsing no longer removed anything, and re-expanding duplicated.
  it("un listing récursif ne rend pas le même fichier à deux profondeurs", () => {
    const listings = {
      "cloud|": [d("cloud|/Clients", "Clients"), f("cloud|/Clients/devis.pdf", "devis.pdf")],
      "cloud|/Clients": [f("cloud|/Clients/devis.pdf", "devis.pdf")],
    };
    const rows = folderTreeRows(["cloud|"], listings, new Set(["cloud|", "cloud|/Clients"]));
    // The PATH can repeat (the recursive listing forces it); the KEY, never.
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("replier un dossier retire VRAIMENT ses lignes", () => {
    const listings = {
      "cloud|": [d("cloud|/Clients", "Clients")],
      "cloud|/Clients": [f("cloud|/Clients/devis.pdf", "devis.pdf")],
    };
    const ouvert = folderTreeRows(["cloud|"], listings, new Set(["cloud|", "cloud|/Clients"]));
    expect(ouvert.map((r) => r.entry.path)).toContain("cloud|/Clients/devis.pdf");
    const replie = folderTreeRows(["cloud|"], listings, new Set(["cloud|"]));
    expect(replie.map((r) => r.entry.path)).not.toContain("cloud|/Clients/devis.pdf");
  });

  it("un doublon DANS un seul listing ne rend qu'une ligne", () => {
    const listings = { "cloud|": [f("cloud|/a.pdf", "a.pdf"), f("cloud|/a.pdf", "a.pdf")] };
    const rows = folderTreeRows(["cloud|"], listings, new Set(["cloud|"]));
    expect(rows.map((r) => r.entry.name)).toEqual(["cloud|", "a.pdf"]);
  });
});
