import type { OcrWord } from "./layout";

/**
 * Les régions qu'un moteur a DÉTECTÉES mais rendues en DÉBRIS — et la relecture ciblée.
 *
 * Le cas qui fonde ce module (CNI scannée réelle, 14/08) : la bande MRZ — police OCR-B,
 * chevrons — est détectée par docTR mais son CRNN (vocabulaire latin ordinaire) la rend
 * « - » à confiance 63. Au-dessus du plancher (25), donc ni droppée ni marquée illisible :
 * un tiret prend la place d'une ligne qui porte NOM, prénoms, date de naissance encodée et
 * numéro — invisible du redaction, lisible à l'œil. Tesseract, lui, lit la bande à 86+.
 *
 * La règle est GÉOMÉTRIQUE, pas spécifique à la MRZ : un texte de ≤ 2 signes dans une boîte
 * dont la largeur vaut ≥ 4 hauteurs est un débris — aucun vrai mot court n'occupe une boîte
 * pareille (un tiret réel vit dans une boîte étroite), et un vrai texte large en remplit la
 * boîte. La relecture est le sens SÛR du routeur, déjà documenté : « Tesseract reads what
 * docTR couldn't — never a leak ».
 */

export interface GarbledRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Largeur minimale, en hauteurs de boîte, pour qu'un texte dérisoire soit un débris. */
const MIN_ASPECT = 4;
/** Au-delà de ce nombre de signes (lettres/chiffres), le mot explique sa boîte. */
const MAX_JUNK_CHARS = 2;
/** Marge de relecture autour de la boîte (en fraction de sa hauteur) — Tesseract lit
 *  mieux avec un peu d'air, et la détection docTR serre parfois les glyphes. */
const PAD = 0.5;

/** Les boîtes suspectes d'une page, prêtes pour `SetRectangle` (coordonnées pleine image —
 *  l'API Tesseract ne ré-origine pas, donc les mots relus retombent au bon endroit). */
export function garbledBoxes(
  words: readonly OcrWord[],
  page: { width: number; height: number },
): GarbledRect[] {
  const out: GarbledRect[] = [];
  for (const w of words) {
    const bw = w.x1 - w.x0;
    const bh = Math.max(1, w.y1 - w.y0);
    if (bw < MIN_ASPECT * bh) continue;
    const signes = w.text.replace(/[^\p{L}\p{N}]/gu, "").length;
    if (signes > MAX_JUNK_CHARS && w.text.trim().length > MAX_JUNK_CHARS + 1) continue;
    const pad = bh * PAD;
    const left = Math.max(0, w.x0 - pad);
    const top = Math.max(0, w.y0 - pad);
    out.push({
      left,
      top,
      width: Math.min(page.width, w.x1 + pad) - left,
      height: Math.min(page.height, w.y1 + pad) - top,
    });
  }
  return out;
}

/** Vrai si `w` est l'un des mots-débris dont une boîte de `rects` est issue — le mot
 *  d'origine se RETIRE quand sa relecture le remplace (sinon le tiret fantôme reste
 *  dans le texte reconstruit, au milieu de la ligne relue). */
export function isGarbledWord(w: OcrWord, rects: readonly GarbledRect[]): boolean {
  return rects.some(
    (r) => w.x0 >= r.left - 1 && w.x1 <= r.left + r.width + 1 && w.y0 >= r.top - 1 && w.y1 <= r.top + r.height + 1,
  );
}
