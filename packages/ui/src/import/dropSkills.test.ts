// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { skillsFromDrop } from "./dropSkills";

/** Une entrée `FileSystemEntry` comme Chromium en fabrique pour un DOSSIER lâché : c'est
 *  la seule forme que le renderer reçoit d'un dépôt (des octets, jamais un chemin). */
const file = (name: string, text = "corps") => ({
  isFile: true,
  isDirectory: false,
  name,
  file: (cb: (f: File) => void) => cb(new File([text], name)),
});
const dir = (name: string, children: unknown[]) => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: () => {
    let done = false;
    // L'API rend des LOTS jusqu'au lot vide, et rappelle sur un TOUR SUIVANT. Les deux
    // comptent : un faux synchrone qui bascule son drapeau APRÈS l'appel fait boucler
    // `readAll` à l'infini — c'est ce qui rendait le dépôt muet, pas le parcours.
    return {
      readEntries: (cb: (e: unknown[]) => void) => {
        const batch = done ? [] : children;
        done = true;
        setTimeout(() => cb(batch), 0);
      },
    };
  },
});
const drop = (entries: unknown[]): DataTransfer =>
  ({ items: entries.map((e) => ({ webkitGetAsEntry: () => e })), files: [] }) as unknown as DataTransfer;

describe("skillsFromDrop", () => {
  it("parcourt un dossier déposé et en sort les compétences", async () => {
    const out = await skillsFromDrop(
      drop([
        dir("skills", [
          dir("relecture", [file("SKILL.md", "Relis.")]),
          dir("revue", [file("SKILL.md", "Trie."), file("notes.md")]),
        ]),
      ]),
    );
    expect(out.map((s) => s.folder).sort()).toEqual(["relecture", "revue"]);
    expect(out.find((s) => s.folder === "revue")?.siblings).toEqual(["notes.md"]);
  });

  // Le piège du dépôt de `~/.claude/skills` : il embarque de la documentation entière.
  it("ignore un dossier sans SKILL.md", async () => {
    const out = await skillsFromDrop(
      drop([dir("skills", [dir("_lifecycles", [file("rules.md"), file("release.md")])])]),
    );
    expect(out).toEqual([]);
  });

  it("accepte une compétence seule (le dossier lui-même)", async () => {
    const out = await skillsFromDrop(drop([dir("relecture", [file("SKILL.md", "Relis.")])]));
    expect(out).toEqual([{ folder: "relecture", text: "Relis.", siblings: [] }]);
  });

  it("accepte un .md déposé directement", async () => {
    const out = await skillsFromDrop(drop([file("mon-prompt.md", "Fais ceci.")]));
    expect(out[0]).toMatchObject({ folder: "mon-prompt", text: "Fais ceci." });
  });

  // Un binaire compte comme ANNEXE mais n'est jamais lu : le charger coûterait la mémoire
  // du dépôt entier pour du contenu qui n'a rien à faire dans un prompt.
  it("compte les fichiers non textuels sans les lire", async () => {
    const out = await skillsFromDrop(
      drop([dir("a", [file("SKILL.md", "x"), file("logo.png", "BINAIRE")])]),
    );
    expect(out[0].siblings).toEqual(["logo.png"]);
  });

  it("rend une liste vide sur un dépôt sans rien de reconnaissable", async () => {
    expect(await skillsFromDrop(drop([file("photo.png")]))).toEqual([]);
  });
});
