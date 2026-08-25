import type { ExtractedFile } from "../host";

/**
 * Un fichier mis en scène AVANT d'être extrait.
 *
 * Le sélecteur natif fait déjà ça (`host.files.pickPaths` : les chips paraissent, le texte
 * suit) et l'écart se voyait — joindre un fichier depuis « Dossiers » attendait la lecture
 * ET l'OCR avant que quoi que ce soit ne bouge. Sur un scan de plusieurs pages, l'app avait
 * l'air figée alors qu'elle travaillait.
 *
 * ⚠️ **Différer ne veut pas dire cacher.** Le chip apparaît en état « extraction en cours »,
 * puis porte son contenu — ou son ÉCHEC. Une promesse rejetée laisse un chip fautif qu'on
 * peut réessayer ; elle n'efface jamais le fichier, ce qui donnerait à croire qu'on n'a
 * jamais cliqué.
 */
export interface DeferredFile {
  name: string;
  mime?: string;
  /** Lit et extrait. Rejette ⇒ le chip porte l'échec. Le callback (optionnel) reçoit
   *  la progression OCR `{done, total}` — une source sans pages mesurables l'ignore,
   *  le chip garde alors sa barre indéterminée. */
  load(onOcrProgress?: (p: { done: number; total: number }) => void): Promise<ExtractedFile>;
}

/** Distingue les deux formes que le shell peut mettre en scène. */
export function isDeferredFile(f: ExtractedFile | DeferredFile): f is DeferredFile {
  return typeof (f as DeferredFile).load === "function";
}
