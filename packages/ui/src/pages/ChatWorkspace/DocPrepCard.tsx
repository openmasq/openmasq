import { BrandLoader } from "../../components/media/BrandLogo";
import { useT } from "../../i18n";

/**
 * La barre de progression du redaction d'un document AU MOMENT DE L'ENVOI — rendre les
 * pages d'un PDF redacted en images prend des secondes, et sans elle l'envoi paraissait
 * bloqué. Le geste qu'elle porte est « Annuler » : l'attente doit toujours avoir une
 * sortie.
 *
 * Elle vit à côté de `ChatView` plutôt que dedans (règle 1) : la page n'a pas à porter
 * une carte de progression en plus du reste.
 */
export interface DocPrepState {
  /** `detect` = analyse (indéterminée) ; `render` = rendu page à page (mesurable). */
  phase: "detect" | "render";
  name: string;
  page: number;
  total: number;
  /** Le rang du document dans un lot, quand il y en a plusieurs. */
  idx: number;
  count: number;
}

export function DocPrepCard({ state, onCancel }: { state: DocPrepState; onCancel: () => void }) {
  const t = useT();
  const { phase, name, page, total, idx, count } = state;
  return (
    <div className="docprep" role="status" aria-live="polite">
      <BrandLoader size={30} mono />
      <div className="docprep-info flex-min">
        <div className="docprep-title">
          {phase === "detect" ? t.conversation.docPrep.analysing : t.conversation.docPrep.redacting}
          {count > 1 && t.conversation.docPrep.ofCount(idx, count)}
        </div>
        <div className="docprep-note">
          {name}
          {total > 0 &&
            (phase === "render"
              ? t.conversation.docPrep.page(page, total)
              : t.conversation.docPrep.pages(total))}
        </div>
        {total > 0 && (
          <div className="docprep-bar">
            <div
              className={`docprep-bar-fill${phase === "detect" ? " indet" : ""}`}
              // Largeur CALCULÉE à l'exécution — le cas où l'inline est la bonne réponse.
              style={phase === "render" ? { width: `${Math.round((page / total) * 100)}%` } : undefined}
            />
          </div>
        )}
      </div>
      <button type="button" className="docprep-cancel" onClick={onCancel}>
        {t.common.cancel}
      </button>
    </div>
  );
}
