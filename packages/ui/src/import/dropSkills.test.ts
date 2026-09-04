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
const drop = (entries: unknown[], files: File[] = []): DataTransfer =>
  ({ items: entries.map((e) => ({ webkitGetAsEntry: () => e })), files }) as unknown as DataTransfer;

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

/**
 * A dropped `.zip` is the only path here that hands an ARCHIVE to a decompressor, and the
 * caps used to be read AFTER `unzipSync` had already inflated every member — so a bomb (or
 * an absent-minded 2 GB archive) allocated everything before a single bound applied. The
 * bounds now ride on fflate's `filter`, which sees each entry's DECLARED size and decides
 * before any inflation.
 */
describe("skillsFromDrop — un .zip est borné AVANT décompression", () => {
  const MAX_BYTES = 256 * 1024; // the module's cap, restated (it is not exported)

  /** A File as the drop hands it over: only `name` + `arrayBuffer` are read. */
  const zipFile = (bytes: Uint8Array, name = "skills.zip") =>
    ({
      name,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }) as unknown as File;

  /** Scramble one entry's COMPRESSED payload in place — inflating it then throws.
   *  That is the observable proof that the entry was never touched: `unzipSync` without a
   *  filter raises « invalid length/literal » on this exact archive. */
  function corrupt(zip: Uint8Array, entryName: string): Uint8Array {
    const hay = new TextDecoder("latin1").decode(zip);
    const nameAt = hay.indexOf(entryName); // first occurrence = the LOCAL file header
    const hdr = nameAt - 30; // local header: 30 fixed bytes, then the name
    const extraLen = zip[hdr + 28] | (zip[hdr + 29] << 8);
    const data = nameAt + entryName.length + extraLen;
    for (let i = data + 5; i < data + 40; i++) zip[i] ^= 0xff;
    return zip;
  }

  it("REFUSE une entrée dont la taille déclarée dépasse le plafond, sans la lire", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    // Highly compressible: ~400 Ko declared, a few hundred bytes on disk — the shape of a
    // bomb, and of any oversized member.
    const zip = zipSync(
      {
        "relecture/SKILL.md": strToU8("Relis."),
        "relecture/gros.md": strToU8("A".repeat(MAX_BYTES + 1)),
      },
      { level: 9 },
    );
    expect(zip.length).toBeLessThan(MAX_BYTES); // rien ne trahit la taille réelle

    const out = await skillsFromDrop(drop([], [zipFile(zip)]));
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("Relis.");
    // Listée comme pièce jointe, jamais lue — la même règle que pour un binaire déposé.
    expect(out[0].siblings).toEqual(["gros.md"]);
  });

  it("ne DÉCOMPRESSE jamais l'entrée refusée (charge utile corrompue = aucune levée)", async () => {
    const { zipSync, strToU8, unzipSync } = await import("fflate");
    const zip = corrupt(
      zipSync(
        {
          "relecture/SKILL.md": strToU8("Relis."),
          "relecture/gros.md": strToU8("A".repeat(MAX_BYTES + 1)),
        },
        { level: 9 },
      ),
      "relecture/gros.md",
    );
    // Contrôle : décompresser TOUT — ce que faisait l'ancien code — lève bien.
    expect(() => unzipSync(zip)).toThrow();
    // Le chemin réel, lui, ne touche pas ces octets.
    const out = await skillsFromDrop(drop([], [zipFile(zip)]));
    expect(out[0].text).toBe("Relis.");
  });

  it("lit toujours les entrées textuelles sous le plafond", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const zip = zipSync({
      "revue/SKILL.md": strToU8("Trie."),
      "revue/notes.md": strToU8("Des notes."),
      "revue/logo.png": strToU8("BINAIRE"),
    });
    const out = await skillsFromDrop(drop([], [zipFile(zip)]));
    expect(out[0].text).toBe("Trie.");
    expect(out[0].siblings?.sort()).toEqual(["logo.png", "notes.md"]);
  });
});
