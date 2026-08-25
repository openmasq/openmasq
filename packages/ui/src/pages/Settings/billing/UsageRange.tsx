/** Les fenêtres offertes. 14 reste le défaut — c'est ce que les panneaux montraient
 *  avant d'être réglables, et changer le défaut aurait modifié tous les chiffres sans
 *  que personne ne l'ait demandé. 90 est le plafond : au-delà, une barre par jour
 *  devient un trait d'un pixel et le graphe cesse de se lire. */
const RANGES = [7, 14, 30, 90] as const;
export type UsageRangeDays = (typeof RANGES)[number];
export const DEFAULT_RANGE: UsageRangeDays = 14;

/**
 * La fenêtre d'observation des panneaux d'usage — 7 / 14 / 30 / 90 jours.
 *
 * Présentation seule : le parent détient la valeur et re-dérive chaque chiffre. Même
 * contrôle segmenté que `UsageFilter`, et posé sur LA MÊME LIGNE que lui : les filtres
 * d'un tableau de bord se tiennent en une rangée au-dessus des graphes, pas dispersés
 * dans les en-têtes de panneaux — sinon on cherche lequel agit sur quoi.
 */
export function UsageRange({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: UsageRangeDays) => void;
}) {
  return (
    <div className="om-seg" role="tablist" aria-label="Fenêtre d'observation">
      {RANGES.map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          aria-selected={value === d}
          className={`om-seg-btn${value === d ? " on" : ""}`}
          onClick={() => onChange(d)}
        >
          {d} j
        </button>
      ))}
    </div>
  );
}
