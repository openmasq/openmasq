/**
 * Géométrie du HALO des zones de texte détecté — pur, unit-testé.
 *
 * Le halo dit à l'utilisateur « ceci a été LU (et part donc, redacted, vers le modèle) » ;
 * ce qui n'en porte pas n'a pas été lu. Pour être agréable ET représentatif, on ne dessine
 * ni un rectangle par MOT (constellation de confettis) ni la boîte englobante d'un
 * paragraphe (elle couvrirait du vide sur les lignes courtes) : les mots sont fusionnés en
 * BANDES DE LIGNE — une bande par segment de ligne réellement écrit, gonflée d'une marge
 * proportionnelle à la hauteur du texte. Le rendu (`.pdfv-texthalo`) est à bords NETS —
 * un lavis plat, sans flou : la frontière lu/non-lu est une information, et un dégradé la
 * rendrait indécidable exactement là où elle compte.
 *
 * Entrées en px (l'espace CSS de la page ou le raster naturel d'une image) ; sorties dans
 * le même espace — l'appelant convertit en % pour suivre la page responsive.
 */

export interface HaloBox {
  left: number;
  top: number;
  w: number;
  h: number;
}

export type HaloRegion = HaloBox;

/** Deux mots d'une même ligne fusionnent si l'écart horizontal ≤ ce facteur × la hauteur
 *  de ligne — assez large pour absorber les espaces inter-mots et la ponctuation, assez
 *  étroit pour laisser deux COLONNES distinctes (une gouttière fait plusieurs hauteurs). */
const GAP_FACTOR = 1.6;
/** Marges du gonflement, en fraction de la hauteur de ligne — petites pour ne pas annexer
 *  les marges du document (les bords étant nets, la bande EST la frontière montrée). */
const PAD_X = 0.45;
const PAD_Y = 0.24;
/** Deux boîtes appartiennent à la même LIGNE si leur recouvrement vertical atteint cette
 *  fraction de la plus petite des deux hauteurs. */
const LINE_OVERLAP = 0.45;

const finite = (b: HaloBox): boolean =>
  Number.isFinite(b.left) && Number.isFinite(b.top) && Number.isFinite(b.w) && Number.isFinite(b.h) && b.w > 0 && b.h > 0;

interface Line {
  y0: number;
  y1: number;
  boxes: HaloBox[];
}

/** Fusionne des boîtes de mots en bandes de ligne gonflées, bornées à `bounds`. */
export function haloRegions(
  boxes: readonly HaloBox[],
  bounds: { w: number; h: number },
): HaloRegion[] {
  const clean = boxes.filter(finite);
  if (!clean.length) return [];

  // 1. Regrouper en LIGNES par recouvrement vertical (les boîtes arrivent dans un ordre
  // quelconque : couche texte puis mots OCR — on trie par centre vertical d'abord).
  const sorted = [...clean].sort((a, b) => a.top + a.h / 2 - (b.top + b.h / 2));
  const lines: Line[] = [];
  for (const b of sorted) {
    const last = lines[lines.length - 1];
    const overlap = last ? Math.min(last.y1, b.top + b.h) - Math.max(last.y0, b.top) : 0;
    if (last && overlap >= LINE_OVERLAP * Math.min(b.h, last.y1 - last.y0)) {
      last.boxes.push(b);
      last.y0 = Math.min(last.y0, b.top);
      last.y1 = Math.max(last.y1, b.top + b.h);
    } else {
      lines.push({ y0: b.top, y1: b.top + b.h, boxes: [b] });
    }
  }

  // 2. Dans chaque ligne : fusion en segments (l'écart > GAP_FACTOR × hauteur sépare —
  // c'est ce qui garde deux colonnes distinctes), puis gonflement borné à la page.
  const out: HaloRegion[] = [];
  for (const line of lines) {
    const h = line.y1 - line.y0;
    const runs = line.boxes.sort((a, b) => a.left - b.left);
    let x0 = runs[0].left;
    let x1 = runs[0].left + runs[0].w;
    const flush = () => {
      const padX = PAD_X * h;
      const padY = PAD_Y * h;
      const left = Math.max(0, x0 - padX);
      const top = Math.max(0, line.y0 - padY);
      out.push({
        left,
        top,
        w: Math.min(bounds.w - left, x1 - x0 + 2 * padX),
        h: Math.min(bounds.h - top, h + 2 * padY),
      });
    };
    for (const b of runs.slice(1)) {
      if (b.left - x1 > GAP_FACTOR * h) {
        flush();
        x0 = b.left;
      }
      x1 = Math.max(x1, b.left + b.w);
    }
    flush();
  }
  return out;
}
