/**
 * Cleanup of extraction errors — the family split out of `core.ts` (cap 300).
 * ALLOW-LIST: only our own curated FR errors pass through as-is; any
 * other cause (an app.asar path, a native stack, arbitrary upstream text) is hidden
 * behind `fallback` for the UI — and TRAVELS as `raw` for the debug log
 * (`ExtractedFile.rawCause`), which lives in the renderer and can hold it (audited 13/08).
 */

export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * OCR FALLBACKS, here because their wording is a discipline, not a string.
 *
 * ⚠️ A fallback STATES, it does not DIAGNOSE. It covers any unknown cause — a
 * binding crash included: measured on 15/08/2026, « Cannot read properties of
 * undefined (reading 'createElement') » displayed as « OCR indisponible sur cet appareil »
 * while the models were actually present. The user read a false verdict on their
 * machine, with nothing to do next. A REAL unavailability has its own message, which
 * passes through intact (`../ocr/ocr.ts`: « moteur OCR indisponible … réinstallez l'application »).
 *
 * ⚠️ And no « réessayez »: these texts ALSO go to the model as a tool error
 * (`read_document`), where an invitation to try again is a loop.
 */
export const OCR_FAILED = "la reconnaissance de texte a échoué (cause technique dans le journal de débogage).";
export const IMAGE_OCR_FAILED = `Texte de l'image illisible : ${OCR_FAILED}`;

/** Our own deliberate, user-actionable FR errors (from `ocr.ts`
 *  `loadTesseract`/`loadCanvas`) — the only raw causes safe to show as-is. */
const isCuratedError = (m: string) => /^moteur (OCR|de rendu)/i.test(m);

/**
 * Turn a caught extraction error into a message SAFE to show the user. ALLOW-LIST,
 * not block-list: only our own curated FR errors pass through; ANY other cause (a
 * missing-package "Cannot find package … app.asar …", a native crash, arbitrary
 * upstream text, a stack) is HIDDEN behind `fallback` so an internal path/detail
 * can never reach a UI banner. The raw cause is kept in the console for diagnostics.
 */
export function cleanErr(e: unknown, fallback: string): { message: string; raw?: string } {
  const raw = msg(e);
  if (isCuratedError(raw)) return { message: raw };
  // eslint-disable-next-line no-console
  if (raw) console.warn("[redact] extraction error (hidden from UI):", raw);
  return { message: fallback, raw: raw || undefined };
}

