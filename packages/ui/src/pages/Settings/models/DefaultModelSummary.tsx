import { PROVIDERS, type ModelInfo } from "@openmasq/llm";
import { CheckIcon, ModelLogo } from "../../../components/brand";
import { modelDisplay } from "../../../prompt/models";

import { useT } from "../../../i18n";
/**
 * CE QUI RÉPOND QUAND ON OUVRE UNE CONVERSATION — nommé en haut de l'écran.
 *
 * Le réglage de cette page est UN choix, mais son résultat n'était lisible nulle part :
 * il fallait parcourir les ~400 cartes et repérer celle qui portait une coche (remonté
 * le 11/08). Un réglage dont on ne peut pas lire la valeur n'est pas réglable.
 *
 * La ligne est un BOUTON, et son seul geste montre la fiche du modèle dans le panneau de
 * droite — jamais changer le défaut : on ne modifie pas un réglage en cliquant sur son
 * énoncé. Absente quand aucun modèle ne correspond (compte sans accès), plutôt qu'un
 * vide qui se lirait comme une panne.
 */
export function DefaultModelSummary({
  model,
  onPreview,
}: {
  model: ModelInfo | undefined;
  /** Afficher la fiche de ce modèle dans le panneau de détail. */
  onPreview: (id: string) => void;
}) {
  const t = useT();
  if (!model) return null;
  const display = modelDisplay(model);
  return (
    <button
      type="button"
      className="model-default-summary"
      title={t.modelPicker.defaultSummaryTip}
      onMouseEnter={() => onPreview(model.id)}
      onClick={() => onPreview(model.id)}
    >
      <span className="model-default-check">
        <CheckIcon size={14} />
      </span>
      <ModelLogo provider={model.provider} modelId={model.id} size={22} tile />
      <span className="model-default-body">
        <span className="model-default-label">{t.modelPicker.defaultSummaryLabel}</span>
        <span className="model-default-name">
          {display.label}
          {display.free && <span className="model-free-badge">gratuit</span>}
          <span className="model-default-provider">{PROVIDERS[model.provider].label}</span>
        </span>
      </span>
    </button>
  );
}
