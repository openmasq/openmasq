/**
 * Le nettoyage des erreurs d'extraction — la famille sortie de `core.ts` (cap 300).
 * ALLOW-LIST : seules nos propres erreurs FR soignées passent telles quelles ; toute
 * autre cause (chemin app.asar, stack native, texte amont arbitraire) est cachée
 * derrière `fallback` pour l'UI — et VOYAGE en `raw` pour le journal de débogage
 * (`ExtractedFile.rawCause`), qui vit dans le renderer et peut la tenir (audit 13/08).
 */

export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Les REPLIS d'OCR, ici parce que leur formulation est une discipline, pas une chaîne.
 *
 * ⚠️ Un repli CONSTATE, il ne DIAGNOSTIQUE pas. Il couvre toute cause inconnue — un
 * plantage du binding compris : mesuré le 15/08/2026, « Cannot read properties of
 * undefined (reading 'createElement') » s'affichait « OCR indisponible sur cet appareil »
 * alors que les modèles étaient bien présents. L'utilisateur lisait un verdict faux sur sa
 * machine, sans rien à faire ensuite. Une indisponibilité RÉELLE a son message à elle, qui
 * traverse intact (`../ocr/ocr.ts` : « moteur OCR indisponible … réinstallez l'application »).
 *
 * ⚠️ Et pas de « réessayez » : ces textes partent AUSSI au modèle comme erreur d'outil
 * (`read_document`), où une invitation à recommencer est une boucle.
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

