/** Formats the app can extract REAL text from (PDF/OCR, OOXML) — the job of
 *  `read_document`. ONE list, shared with main's routing (rule 9): both
 *  answer the same question, and a copy that drifted would make the worker's refusal and the
 *  extraction fallback inconsistent. */
import { EXTRACTABLE as DOCUMENT } from "./readRoute";
import { BRAND } from "@openmasq/branding";

/**
 * Is this file readable as TEXT, and if not, what should the model do instead?
 *
 * WHY THIS EXISTS — a real failure, 2026-07-28. Asked to « fais un résumé de tous les
 * documents de ces dossiers », the model called `read_file` on a PDF. `readFile(p,"utf8")`
 * happily returned 16 000 characters of mojibake, which then cost **4.5 seconds of local
 * NER** on garbage and put 52 000 characters of binary noise into the prompt. Nothing
 * errored. The model simply could not answer, and the user paid for it in latency and
 * tokens.
 *
 * The fix is fail-closed and cheap: a document format is REFUSED by `read_file`, with a
 * message naming the tool that does work. Reading a PDF as text is never what anyone meant.
 *
 * ⚠️ This refusal is now a BACKSTOP on the tool surface: MAIN routes a `read_file`
 * launched on a document to extraction before the worker ever sees it (`readRoute.ts`,
 * which says why — a weak model kept replaying the same call until the loop's cap).
 * We keep it whole: it is the worker's guard if a caller bypasses this routing, and
 * it remains the ONLY verdict for what has nothing to extract (image, archive, executable).
 */

/** Formats with no text to extract at all. */
const OPAQUE =
  /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|svg|ico|mp[34]|m4a|wav|aac|flac|ogg|mov|avi|mkv|webm|zip|gz|tar|7z|rar|dmg|exe|dll|so|dylib|bin|wasm|sqlite|db)$/i;

export type ReadVerdict =
  | { kind: "text" }
  | { kind: "document"; message: string }
  | { kind: "opaque"; message: string };

/**
 * Decide from the NAME first (cheap, and the honest signal for a document), then from the
 * BYTES — a NUL in the head is proof enough that this is not text, whatever it is called.
 */
export function readVerdict(name: string, head: Uint8Array): ReadVerdict {
  if (DOCUMENT.test(name)) {
    return {
      kind: "document",
      message:
        `« ${name} » est un document, pas du texte brut : utilise \`read_document\` pour en ` +
        `extraire le contenu (${BRAND.name} sait lire les PDF, Word, Excel et PowerPoint, y compris ` +
        `les scans). \`read_file\` renverrait des octets illisibles.`,
    };
  }
  if (OPAQUE.test(name)) {
    return {
      kind: "opaque",
      message:
        `« ${name} » est un fichier binaire (image, archive, média, exécutable) : il n'a pas ` +
        `de contenu texte à lire. Décris-le par \`get_file_info\` si tu as besoin de sa taille ` +
        `ou de sa date.`,
    };
  }
  // Unknown extension: trust the bytes. A NUL byte never appears in UTF-8 text.
  if (head.includes(0)) {
    return {
      kind: "opaque",
      message:
        `« ${name} » ne contient pas du texte (octets binaires détectés) — le lire ne ` +
        `donnerait que des caractères illisibles.`,
    };
  }
  return { kind: "text" };
}
