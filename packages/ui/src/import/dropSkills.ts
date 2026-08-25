import type { RawSkillFile } from "./claudeSkills";
import { skillsFromPaths, type DroppedFile } from "./skillsFromPaths";

/**
 * Ce qu'un DÉPÔT donne — la partie qui touche le DOM. La règle (« qu'est-ce qui vaut une
 * compétence ») est pure et testée à côté : `skillsFromPaths.ts`.
 *
 * ⚠️ **Un dossier déposé donne ses OCTETS, pas son chemin.** `webkitGetAsEntry` laisse le
 * renderer parcourir l'arborescence lâchée et lire les fichiers, sans que rien n'accorde
 * un chemin au processus privilégié. C'est ce qui rend le dépôt à la fois le geste le plus
 * court et celui qui ne demande aucune capacité nouvelle — contrairement à une lecture par
 * chemin, qui élargirait le read-gate de main.
 *
 * Bornes : un dépôt hostile (ou distrait — `~/Documents`) ne doit ni geler l'app ni
 * l'affamer. On s'arrête en profondeur, en nombre de fichiers et en taille.
 */
const MAX_DEPTH = 4;
const MAX_FILES = 800;
const MAX_BYTES = 256 * 1024;
const TEXT = /\.(md|markdown|txt)$/i;

/** Les entrées d'un répertoire, en une fois (l'API en rend des lots jusqu'au lot vide). */
function readAll(reader: { readEntries(cb: (e: unknown[]) => void, err: (e: unknown) => void): void }): Promise<unknown[]> {
  return new Promise((resolve) => {
    const acc: unknown[] = [];
    const step = (): void =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(acc);
        acc.push(...batch);
        step();
      }, () => resolve(acc));
    step();
  });
}

/** `FileReader` plutôt que `Blob.text()` : la seconde n'existe pas partout où ce code doit
 *  tourner (jsdom, donc les tests), et une API qu'on ne peut pas tester est une API dont on
 *  découvre la panne en production — ici, un dépôt qui rendait silencieusement zéro. */
function readText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
    fr.onerror = () => resolve("");
    fr.readAsText(file);
  });
}

interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?(cb: (f: File) => void, err: (e: unknown) => void): void;
  createReader?(): { readEntries(cb: (e: unknown[]) => void, err: (e: unknown) => void): void };
}

async function walk(entry: FsEntry, prefix: string, out: DroppedFile[], depth: number): Promise<void> {
  if (out.length >= MAX_FILES || depth > MAX_DEPTH) return;
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile && entry.file) {
    // Le texte seulement : une image ou un binaire n'a rien à faire dans un prompt, et
    // les lire coûterait la mémoire du dépôt entier pour rien.
    if (!TEXT.test(entry.name)) {
      out.push({ path, text: "" }); // compte comme ANNEXE, sans être lu
      return;
    }
    const file = await new Promise<File | null>((r) => entry.file!((f) => r(f), () => r(null)));
    if (!file || file.size > MAX_BYTES) return;
    out.push({ path, text: await readText(file) });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    for (const child of await readAll(entry.createReader())) {
      await walk(child as FsEntry, path, out, depth + 1);
    }
  }
}

/** Un `.zip` (l'archive qu'on téléverse sur claude.ai a la même forme qu'un dossier). */
async function fromZip(bytes: Uint8Array): Promise<DroppedFile[]> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(bytes);
  const out: DroppedFile[] = [];
  for (const [path, data] of Object.entries(files)) {
    if (out.length >= MAX_FILES || path.endsWith("/")) continue;
    if (!TEXT.test(path)) {
      out.push({ path, text: "" });
      continue;
    }
    if (data.length > MAX_BYTES) continue;
    out.push({ path, text: strFromU8(data) });
  }
  return out;
}

const isZip = (b: Uint8Array): boolean => b.length > 1 && b[0] === 0x50 && b[1] === 0x4b;

/** Ce qui a été lâché → les compétences qu'on peut en tirer. */
export async function skillsFromDrop(dt: DataTransfer): Promise<RawSkillFile[]> {
  const files: DroppedFile[] = [];
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((i) => (i.webkitGetAsEntry?.() ?? null) as FsEntry | null)
    .filter((e): e is FsEntry => !!e);

  if (entries.length) {
    for (const e of entries) await walk(e, "", files, 0);
  }
  // Les zips n'ont pas d'arborescence à parcourir : ils passent par le fichier lui-même.
  for (const f of Array.from(dt.files ?? [])) {
    if (!/\.zip$/i.test(f.name)) continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (isZip(bytes)) files.push(...(await fromZip(bytes)));
  }
  return skillsFromPaths(files);
}
