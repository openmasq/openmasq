import { constants, type Stats } from "node:fs";
import { open, stat, type FileHandle } from "node:fs/promises";
import { realPathOrNull } from "./pathScope";

/**
 * Open a file for READING and authorize the DESCRIPTOR, not a path checked earlier — the one
 * primitive behind every gated by-path read in main (`../ipc/readGate.ts`, `../ocr/extractJobs.ts`).
 *
 * `O_NOFOLLOW` only covers the LAST component: a PARENT directory swapped for a symlink between
 * the gate's realpath and the `open` would still be followed. So, on the open descriptor:
 *   1. it is a regular file (`O_NONBLOCK`: a FIFO never holds main);
 *   2. the path re-resolves to ITSELF (no component of it is a link now) and passes `allowed`
 *      again;
 *   3. the file at that path is the file opened (same `dev`/`ino`).
 * Any mismatch closes the descriptor and refuses. Residual (no portable fd→path query in Node):
 * a process flipping a parent twice between steps 2 and 3 is not caught; the gate's caller
 * holds that window to a few syscalls. Pinned in `pinnedOpen.test.ts`.
 */
export async function openPinned(path: string, allowed: (realPath: string) => boolean): Promise<{ fh: FileHandle; st: Stats }> {
  const real = realPathOrNull(path);
  if (!real || !allowed(real)) throw new Error("Accès fichier refusé : chemin non autorisé.");
  const fh = await open(real, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw new Error("Accès fichier refusé : ce n'est pas un fichier.");
    const again = realPathOrNull(real);
    if (again !== real || !allowed(again)) throw new Error("Accès fichier refusé : chemin non autorisé.");
    const at = await stat(again);
    if (at.dev !== st.dev || at.ino !== st.ino) throw new Error("Accès fichier refusé : chemin non autorisé.");
    return { fh, st };
  } catch (e) {
    await fh.close();
    throw e;
  }
}
