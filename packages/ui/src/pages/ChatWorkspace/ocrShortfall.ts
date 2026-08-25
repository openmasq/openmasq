import type { Attachment } from "./Composer";

/**
 * Une pièce jointe dont l'OCR s'est ARRÊTÉ au plafond (10 pages par défaut) — le chip
 * doit le DIRE, et offrir « Lire tout ».
 *
 * Le plafond existe pour une bonne raison (un scan se lit en secondes PAR PAGE : sans
 * borne, un document de 300 pages gèle l'envoi de longues minutes sans que rien ne l'ait
 * choisi) — mais tronquer EN SILENCE est le péché que ce produit refuse partout ailleurs :
 * l'utilisateur croit son document lu, le modèle répond sur un tiers du dossier, et la
 * seule trace est un marqueur enfoui dans un texte que personne ne relit.
 */
export function ocrShortfall(
  a: Pick<Attachment, "ocr" | "extracting" | "error">,
): { read: number; total: number } | null {
  if (a.extracting || a.error) return null;
  const pages = a.ocr?.pages;
  const total = a.ocr?.pagesTotal;
  if (!pages || !total || total <= pages) return null;
  return { read: pages, total };
}
