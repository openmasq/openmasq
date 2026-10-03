/** Past this many files, a turn's list folds into ONE summary row (« 8 fichiers »): eight
 *  full-width cards stacked half a screen under a one-line question. */
export const FILES_SUMMARY_AFTER = 4;

export type FileEntry = { name: string; kind: string; mime?: string; redactions?: number; clipped?: boolean };

/** The format a card leads with: the extension, upper-cased, at most four letters. */
export function fileExt(f: { name: string; kind: string }): string {
  const dot = f.name.lastIndexOf(".");
  return (dot > 0 ? f.name.slice(dot + 1) : f.kind).toUpperCase().slice(0, 4);
}

/** The key the list's open/closed state lives under. Module-level, like a folded bubble
 *  (`../bubbleFold.ts`): the thread is virtualised and a row scrolled back must not fold. */
export function filesFoldKey(owner: string | undefined, files: readonly FileEntry[]): string {
  return `files:${owner ?? files.map((f) => f.name).join("\u0000")}`;
}
