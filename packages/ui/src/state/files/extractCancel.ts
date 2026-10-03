/**
 * The chips whose READ the user stopped by removing them. A read cannot always be
 * interrupted (main's in-process fallback runs to its end), and a cancelled one settles with
 * an error — so the code that started it asks here before touching anything: no failure
 * banner for a file the user removed, no masking run for a chip no longer staged.
 * A chip id is never reused, so a mark only ever means « this chip is gone ».
 */
const cancelled = new Set<string>();

/** Mark `cid`'s read as stopped and ask the host to stop it (a no-op once it has finished). */
export function cancelExtraction(cid: string, cancel?: (job: string) => void): void {
  cancelled.add(cid);
  try {
    cancel?.(cid);
  } catch {
    /* best-effort: the mark alone already keeps the result off the composer */
  }
}

/** Did the user remove this chip while it was being read? */
export const isExtractionCancelled = (cid: string): boolean => cancelled.has(cid);
