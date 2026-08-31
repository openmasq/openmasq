/**
 * WHO reads a file for the model: the worker, or MAIN's extraction pipeline.
 *
 * Two rules, one decision — pure, so testable without forking anything.
 *
 * 1. `read_document` splits by FORMAT (the original rule): a `.docx` is read in the
 *    WORKER by the paragraph logic that `edit_document` knows how to find again; everything
 *    else goes through MAIN (pdf.js, OOXML, OCR — out of reach of a bare Node worker).
 *
 * 2. ⚠️ `read_file` on a DOCUMENT is routed to the same extraction, instead of a refusal.
 *    Measured on 15/08/2026 on real invoices: the model calls `read_file` on a
 *    PDF, the worker's refusal NAMES `read_document` though… and the same call goes out
 *    identically, three times per file, until the loop cap — the user gets
 *    "Tool loop interrupted" on a file the app can perfectly well read. A
 *    weak model doesn't correct itself from a message, however accurate — verified on two
 *    models, two days running.
 *
 *    This is NOT a capability widening (rule 7): `read_document` is already offered
 *    to the same model, on the same path, behind the same `grant.resolve`, and the result
 *    still comes back redacted through the same path. And the harm `binaryGuard` prevents —
 *    16,000 characters of gibberish then 4.5 s of NER on it — doesn't recur: an extraction
 *    returns REAL text. The refusal stays in full force for what has nothing to extract
 *    (image, archive, executable): there, no other tool would do better.
 */
import { BRAND } from "@openmasq/branding";


/** Formats the app can extract text from — the list in `binaryGuard.ts`, its only
 *  other reader, kept in ONE place (rule 9). */
export const EXTRACTABLE = /\.(pdf|docx|doc|xlsx|xlsm|xls|pptx|ppt|odt|ods|odp|rtf|pages|numbers|key)$/i;

export type ReadRoute =
  /** The op goes to the worker as-is. */
  | "worker"
  /** The worker, but via `read_document`: the paragraph-based .docx read. */
  | "docx-worker"
  /** MAIN's extraction pipeline (PDF, spreadsheets, presentations, scans + OCR). */
  | "main-extract";

export function readRoute(tool: string, path: unknown): ReadRoute {
  if (typeof path !== "string" || !path) return "worker";
  const isDoc = EXTRACTABLE.test(path);
  const isDocx = /\.docx$/i.test(path);
  if (tool === "read_document") return isDocx ? "docx-worker" : "main-extract";
  // The fallback ONLY applies to a document: a `.txt`, a `.csv` or an unknown extension
  // stay on the worker's paginated text read, byte-check verdict included.
  if (tool === "read_file" && isDoc) return isDocx ? "docx-worker" : "main-extract";
  return "worker";
}

/** What the model reads at the top of a rerouted `read_file`: the result STATES what
 *  happened (it didn't read raw bytes) and names the direct tool for next time. A
 *  silent substitution would teach the model that `read_file` reads PDFs — false elsewhere. */
export function extractedNote(name: string): string {
  return (
    `[« ${name} » est un document : ${BRAND.name} en a extrait le texte avec \`read_document\` ` +
    `— appelle-le directement la prochaine fois, \`read_file\` ne lit que du texte brut.]\n`
  );
}
