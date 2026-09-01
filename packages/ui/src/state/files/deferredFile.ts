import type { ExtractedFile } from "../../host";

/**
 * A file staged BEFORE being extracted.
 *
 * The native picker already does this (`host.files.pickPaths`: the chips appear, the text
 * follows) and the gap showed — attaching a file from « Dossiers » awaited the read
 * AND the OCR before anything moved. On a multi-page scan, the app looked
 * frozen while it was actually working.
 *
 * ⚠️ **Deferring doesn't mean hiding.** The chip appears in an « extraction en cours »
 * state, then carries its content — or its FAILURE. A rejected promise leaves a faulty chip
 * that can be retried; it never erases the file, which would suggest
 * it was never clicked.
 */
export interface DeferredFile {
  name: string;
  mime?: string;
  /** Reads and extracts. Rejects ⇒ the chip carries the failure. The callback (optional) receives
   *  OCR progress `{done, total}` — a source with no measurable pages ignores it,
   *  the chip then keeps its indeterminate bar. */
  load(onOcrProgress?: (p: { done: number; total: number }) => void): Promise<ExtractedFile>;
}

/** Distinguishes the two shapes the shell can stage. */
export function isDeferredFile(f: ExtractedFile | DeferredFile): f is DeferredFile {
  return typeof (f as DeferredFile).load === "function";
}
