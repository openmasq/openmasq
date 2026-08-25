import { describe, expect, it } from "vitest";
import { assertFileId } from "@openmasq/connectors";
import { CLOUD_PROVIDERS } from "./providers";

/**
 * Les adaptateurs de stockage distant.
 *
 * Ce qui vaut un test, c'est la frontière : l'identifiant de dossier est la SEULE valeur
 * que le renderer choisit, et il finit dans l'URL d'un fournisseur — dans un `q='<id>' in
 * parents` chez Drive, dans un segment de chemin chez Graph. Une apostrophe ou une barre
 * oblique qui passerait sortirait de la requête. Le reste (le tri, le type d'entrée) se
 * vérifie ici plutôt qu'à l'écran, où une réponse d'API ne se rejoue pas.
 */

const drive = CLOUD_PROVIDERS["google-drive"];
const onedrive = CLOUD_PROVIDERS["microsoft-onedrive"];

describe("assertFileId — la seule valeur que le modèle ou le renderer choisit", () => {
  it("accepte les formes réelles des deux fournisseurs", () => {
    expect(assertFileId("1a2B3c_D-e4F")).toBe("1a2B3c_D-e4F"); // Drive
    expect(assertFileId("01ABCDEFGH!123.456")).toBe("01ABCDEFGH!123.456"); // Graph
  });

  it("refuse ce qui permettrait de sortir de la requête ou du chemin", () => {
    for (const bad of ["a'b", "a/b", "a b", "../x", "a\\b", "", "a".repeat(201)]) {
      expect(() => assertFileId(bad), bad).toThrow();
    }
  });
});

describe("Google Drive", () => {
  it("liste les enfants du dossier, la racine étant l'alias `root`", () => {
    expect(drive.childrenUrl(null)).toContain(encodeURIComponent("'root' in parents"));
    expect(drive.childrenUrl("1a2B3c")).toContain(encodeURIComponent("'1a2B3c' in parents"));
    // La corbeille n'est pas un dossier de travail.
    expect(drive.childrenUrl(null)).toContain(encodeURIComponent("trashed = false"));
  });

  it("refuse un id malformé AVANT de construire une URL", () => {
    expect(() => drive.childrenUrl("x' or '1'='1")).toThrow();
  });

  it("relit la réponse : dossiers d'abord, puis A→Z", () => {
    const entries = drive.parse({
      files: [
        { id: "3", name: "zebre.txt", mimeType: "text/plain", modifiedTime: "2026-07-01T10:00:00Z" },
        { id: "2", name: "Élan", mimeType: "application/vnd.google-apps.folder" },
        { id: "1", name: "Abeille.txt", mimeType: "text/plain" },
        { name: "sans id" },
      ],
    });
    expect(entries.map((e) => e.name)).toEqual(["Élan", "Abeille.txt", "zebre.txt"]);
    expect(entries[0].kind).toBe("dir");
    expect(entries[2].mtime).toBeGreaterThan(0);
    // Une entrée sans id ne peut pas être rouverte : elle n'entre pas dans l'arbre.
    expect(entries).toHaveLength(3);
  });

  it("une réponse vide ou inattendue donne une liste vide, jamais une exception", () => {
    expect(drive.parse({})).toEqual([]);
    expect(drive.parse(null)).toEqual([]);
  });
});

describe("OneDrive", () => {
  it("liste la racine du lecteur, puis les enfants d'un élément", () => {
    expect(onedrive.childrenUrl(null)).toContain("/me/drive/root/children");
    expect(onedrive.childrenUrl("01ABC!1")).toContain(
      `/me/drive/items/${encodeURIComponent("01ABC!1")}/children`,
    );
  });

  it("distingue un dossier d'un fichier par la facette `folder`", () => {
    const entries = onedrive.parse({
      value: [
        { id: "b", name: "note.md", lastModifiedDateTime: "2026-07-02T08:00:00Z" },
        { id: "a", name: "Projets", folder: { childCount: 2 } },
      ],
    });
    expect(entries.map((e) => [e.name, e.kind])).toEqual([
      ["Projets", "dir"],
      ["note.md", "file"],
    ]);
  });
});
