import type { ModelDay } from "./usageActivity";

/** Combien de modèles reçoivent une couleur à eux. La rampe en offre sept
 *  (`--chart-1..7`) ; on en montre CINQ, parce qu'au-delà une légende cesse d'être lue
 *  et qu'un sixième aplat prend la place qu'il faut pour distinguer les cinq premiers. */
export const NAMED_SERIES = 5;

/** Le seau « tout le reste ». Son libellé est du produit, pas de la donnée. */
export const OTHER_ID = "__other__";

export interface Series {
  /** Id de modèle, ou `OTHER_ID`. */
  id: string;
  /** Le jeton CSS à peindre — `var(--chart-N)` ou `var(--chart-other)`. */
  color: string;
  /** Total sur la fenêtre, pour l'ordre de la légende et son chiffre. */
  total: number;
}

/**
 * **Quelles séries la timeline dessine, et de quelle couleur.**
 *
 * Les cinq modèles les plus utilisés sur la fenêtre reçoivent chacun une teinte de la
 * rampe catégorielle ; tous les autres fondent dans « Autres ». C'est la règle que la
 * rampe elle-même énonce (`styles.css`) : sept emplacements assignés dans un ORDRE FIXE
 * et jamais cyclés — repeindre une huitième série avec la couleur de la première serait
 * pire que d'admettre qu'elle est « autre ».
 *
 * ⚠️ **La couleur suit le MODÈLE, jamais son rang d'affichage.** Deux modèles restent
 * distincts même quand l'un passe devant l'autre : l'emplacement est attribué une fois,
 * sur le classement de la fenêtre, et `colorOf` le relit par id. Résiduel assumé et
 * mesurable : changer de fenêtre (7 → 90 jours) peut changer QUI est dans le top 5, donc
 * recolorer. L'alternative — figer les couleurs sur tout l'historique — ferait qu'une
 * fenêtre courte dessinerait cinq séries « autres » sans en nommer aucune, ce qui est le
 * défaut inverse et pire.
 *
 * ⚠️ **Un modèle ABSENT de la fenêtre n'a pas de série.** On ne peint pas une ligne à
 * zéro : une légende qui nomme cinq modèles dont trois n'ont rien envoyé fait chercher
 * des aplats qui n'existent pas.
 *
 * Pur — `usageSeries.test.ts`.
 */
export function buildSeries(days: ModelDay[], models: string[]): Series[] {
  const totals = new Map<string, number>();
  for (const d of days) {
    for (const [id, n] of Object.entries(d.byModel)) {
      if (n > 0) totals.set(id, (totals.get(id) ?? 0) + n);
    }
  }
  // `models` porte déjà l'ordre du volume décroissant ; on le filtre sur ce que la
  // fenêtre contient VRAIMENT plutôt que de refaire un tri qui pourrait en diverger.
  const present = models.filter((m) => (totals.get(m) ?? 0) > 0);
  const named = present.slice(0, NAMED_SERIES);
  const rest = present.slice(NAMED_SERIES);

  const out: Series[] = named.map((id, i) => ({
    id,
    color: `var(--chart-${i + 1})`,
    total: totals.get(id) ?? 0,
  }));
  if (rest.length) {
    out.push({
      id: OTHER_ID,
      color: "var(--chart-other)",
      total: rest.reduce((s, m) => s + (totals.get(m) ?? 0), 0),
    });
  }
  return out;
}

/** Le compte d'une série pour un jour — « Autres » additionne tout ce qui n'est pas nommé. */
export function dayCount(day: ModelDay, s: Series, named: ReadonlySet<string>): number {
  if (s.id !== OTHER_ID) return day.byModel[s.id] ?? 0;
  let n = 0;
  for (const [id, c] of Object.entries(day.byModel)) if (!named.has(id)) n += c;
  return n;
}

/**
 * `id de modèle → jeton de couleur`, pour toute surface qui doit s'ACCORDER avec le
 * graphe — la liste « Usage par modèle » sous lui, d'abord. Deux panneaux voisins qui
 * peignent le même modèle de deux couleurs différentes sont pires qu'un seul panneau.
 * Un modèle hors du top 5 rend le neutre, exactement comme sa part dans la barre.
 */
export function seriesColors(series: Series[]): Map<string, string> {
  return new Map(series.map((s) => [s.id, s.color]));
}
