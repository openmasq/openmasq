// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { skillsFromDrop } from "./dropSkills";

/** A `FileSystemEntry` as Chromium builds one for a dropped FOLDER: it's
 *  the only form the renderer receives from a drop (bytes, never a path). */
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
    // The API yields BATCHES until the empty batch, and calls back on a NEXT TICK. Both
    // matter: a sync fake that flips its flag AFTER the call makes `readAll` loop
    // forever — that's what made the drop silent, not the traversal.
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

  // The trap of dropping `~/.claude/skills`: it carries a whole documentation tree.
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

  // A binary counts as an ATTACHMENT but is never read: loading it would cost the memory
  // of the whole drop for content that has no business in a prompt.
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
