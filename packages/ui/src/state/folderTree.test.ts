import { describe, expect, it } from "vitest";
import type { LocalFsEntry } from "../host";
import { MAX_TREE_DEPTH, folderTreeRows, missingListings, toggleFolder } from "./folderTree";

/**
 * L'aplatissement de l'arborescence des dossiers autorisés.
 *
 * Deux choses valent un test plutôt qu'un paragraphe : un dossier ouvert dont le listing
 * n'est pas encore là doit se DIRE en cours (un dossier vide et un dossier pas encore lu
 * se ressemblent à l'écran, et confondre les deux fait croire que la machine ment), et un
 * lien qui pointe vers un ancêtre ne doit pas pouvoir faire boucler le rendu — l'état
 * d'ouverture étant indexé par chemin absolu, c'est exprimable en trois clics.
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

    // Listing arrivé et vide : ce n'est plus un chargement, c'est un dossier vide.
    const [read] = folderTreeRows(["/a"], { "/a": [] }, new Set(["/a"]));
    expect(read.loading).toBe(false);
  });

  it("un listing en cours de rafraîchissement reste marqué en cours", () => {
    const [root] = folderTreeRows(["/a"], { "/a": [] }, new Set(["/a"]), new Set(["/a"]));
    expect(root.loading).toBe(true);
  });

  it("ne déplie pas un dossier à l'intérieur de lui-même — le lien vers un ancêtre", () => {
    // `/a/boucle` est un lien résolu par main vers `/a` : même chemin absolu, donc même
    // état d'ouverture. Sans la garde, la marche récursive ne s'arrêterait jamais.
    const rows = folderTreeRows(
      ["/a"],
      { "/a": [dir("/a", "boucle"), file("/a/note.md")] },
      new Set(["/a"]),
    );
    expect(rows.map((r) => r.entry.name)).toEqual(["a", "boucle", "note.md"]);
    expect(rows[1].expanded).toBe(false);
  });

  it("borne la profondeur rendue", () => {
    // Une chaîne bien plus profonde que la garde, entièrement ouverte.
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
    // `/a/sub` est ouvert mais son parent ne l'est pas : il n'apparaît dans aucune ligne,
    // donc le rail ne doit pas payer sa lecture.
    const expanded = new Set(["/a/sub"]);
    const rows = folderTreeRows(["/a"], {}, expanded);
    expect(missingListings(rows, {})).toEqual([]);

    const open = folderTreeRows(["/a"], { "/a": [dir("/a/sub")] }, new Set(["/a", "/a/sub"]));
    expect(missingListings(open, { "/a": [dir("/a/sub")] })).toEqual(["/a/sub"]);
  });
});

describe("folderTreeRows — un ÉCHEC n'est pas un chargement", () => {
  // Le symptôme qu'on a vu : un dossier dont le listage rate restait « … » indéfiniment,
  // ce qui se lit comme un dossier lent — donc comme un dossier qui ne rend pas ses
  // enfants. Un échec a une cause, affichée sous le panneau ; il doit se DIRE.
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

  // Le cas réel : un stockage distant rend un listing RÉCURSIF, donc le petit-fils arrive
  // à côté de son parent. Deux lignes pour un même chemin = deux fois la même clé React :
  // replier n'enlevait plus rien, et redéplier dupliquait.
  it("un listing récursif ne rend pas le même fichier à deux profondeurs", () => {
    const listings = {
      "cloud|": [d("cloud|/Clients", "Clients"), f("cloud|/Clients/devis.pdf", "devis.pdf")],
      "cloud|/Clients": [f("cloud|/Clients/devis.pdf", "devis.pdf")],
    };
    const rows = folderTreeRows(["cloud|"], listings, new Set(["cloud|", "cloud|/Clients"]));
    // Le CHEMIN peut se répéter (le listing récursif l'impose) ; la CLÉ, jamais.
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
