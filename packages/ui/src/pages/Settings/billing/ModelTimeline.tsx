import { useMemo } from "react";
import type { Conversation } from "../../../types";
import type { BilledFilter } from "../../../state/usage";
import { findModelAny } from "../../../prompt/models";
import { dailyModelMessages } from "./usageActivity";
import { OTHER_ID, buildSeries, dayCount } from "./usageSeries";

import { useT } from "../../../i18n";
/** Le nom affiché d'une série : le libellé du registre, ou « Autres » pour le seau. */
const seriesLabel = (id: string, other: string): string =>
  id === OTHER_ID ? other : findModelAny(id)?.label ?? id;

/**
 * Barres empilées — messages/jour, une couleur PAR MODÈLE.
 *
 * ⚠️ Les couleurs viennent de la rampe catégorielle `--chart-*`, jamais des `--hl-*`.
 * Les teintes de redaction sont des fonds de surligneur : mesurées 1,3–2,5:1 sur une
 * carte blanche, elles échouent comme séries. Et elles coloraient par FOURNISSEUR — deux
 * modèles OpenAI portaient donc le même aplat, ce qui rendait la question « lequel ai-je
 * le plus utilisé ? » sans réponse. `usageSeries.ts` nomme les cinq premiers et replie le
 * reste dans « Autres ».
 *
 * ⚠️ Le filet de 2 px entre segments n'est pas un ornement. La séparation CVD la plus
 * faible de la rampe claire tombe à 7,2 (tritan), ce que la référence dataviz n'autorise
 * qu'avec un encodage SECONDAIRE — l'écart et la légende sont cet encodage. Le retirer
 * rend deux séries voisines confondues pour une partie des lecteurs.
 */
export function ModelTimeline({
  conversations,
  filter,
  days = 14,
}: {
  conversations: Conversation[];
  filter: BilledFilter;
  days?: number;
}) {
  const t = useT();
  const { days: stack, models } = useMemo(
    () => dailyModelMessages(conversations, days, filter),
    [conversations, days, filter],
  );
  const series = useMemo(() => buildSeries(stack, models), [stack, models]);
  const named = useMemo(
    () => new Set(series.filter((s) => s.id !== OTHER_ID).map((s) => s.id)),
    [series],
  );
  const maxDay = Math.max(1, ...stack.map((d) => d.total));

  return (
    <div className="usage-panel">
      <div className="usage-panel-head">
        <h3 className="usage-panel-title">{t.usageTab.timelineTitle(days)}</h3>
        {/* Le MAX est écrit : sans axe des ordonnées, une hauteur seule ne dit rien, et
            l'infobulle doit AJOUTER une lecture, pas en conditionner une. */}
        <span className="usage-panel-meta">
          {t.usageTab.timelineMeta(maxDay)}
        </span>
      </div>

      {series.length === 0 ? (
        <p className="mcp-empty usage-empty">{t.usageTab.timelineEmpty}</p>
      ) : (
        <>
          <div className="usage-stack" role="group" aria-label={t.usageTab.timelineAria}>
            {stack.map((d, i) => {
              // Le survol dit QUI, pas seulement combien : une barre empilée sans
              // infobulle oblige à faire l'aller-retour vers la légende pour chaque
              // segment. Jour le plus ancien à gauche ; un jour vide le dit aussi.
              const day = `J-${days - 1 - i}`;
              const lines = series
                .map((s) => ({ s, n: dayCount(d, s, named) }))
                .filter((x) => x.n > 0)
                .map((x) => `${seriesLabel(x.s.id, t.usageTab.other)} : ${x.n}`);
              const label = lines.length ? [day, ...lines].join("\n") : `${day} · aucun message`;
              return (
                /* La cible est la COLONNE, pas la barre : à un message par jour la barre
                   fait quelques pixels, et un jour vide n'a rien à viser. Focalisable —
                   le clavier lit la même chose que la souris (`TooltipLayer`/`focusin`). */
                <div
                  key={i}
                  className="usage-stack-col"
                  role="img"
                  tabIndex={0}
                  title={label}
                  aria-label={label.replace(/\n/g, ", ")}
                >
                  <div
                    className="usage-stack-bar"
                    // hauteur issue de la donnée → l'exception inline assumée
                    style={{ height: `${(d.total / maxDay) * 100}%` }}
                  >
                    {series.map((s) => {
                      const n = dayCount(d, s, named);
                      if (n === 0) return null;
                      return (
                        <div
                          key={s.id}
                          className="usage-stack-seg"
                          style={{ height: `${(n / d.total) * 100}%`, background: s.color }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="usage-axis">
            <span>J-{days - 1}</span>
            <span>J</span>
          </div>
          <div className="usage-legend">
            {series.map((s) => (
              <span key={s.id} className="usage-legend-item">
                <span className="usage-legend-dot" style={{ background: s.color }} />
                {seriesLabel(s.id, t.usageTab.other)}
                <span className="usage-legend-n">{s.total}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
