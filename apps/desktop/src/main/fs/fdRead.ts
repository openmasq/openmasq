import { constants, type Stats } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";

/**
 * Open a granted path for READING, and check it on the open descriptor. The grant resolved the
 * path to its real place; between that and a later `stat` + `readFile` by name, the name could
 * be swapped for a link. Here the final component is never followed (`O_NOFOLLOW`), the open
 * never waits (`O_NONBLOCK`: a FIFO would hold the worker), and every check and read after it
 * goes through THIS descriptor. Pinned in `fdRead.test.ts`.
 */
export async function openRegular(path: string): Promise<{ fh: FileHandle; st: Stats }> {
  const fh = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw new Error("ce chemin n'est pas un fichier");
    return { fh, st };
  } catch (e) {
    await fh.close();
    throw e;
  }
}
