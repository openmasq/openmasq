import { PROVIDERS, type ModelInfo } from "@openmasq/llm";
import { CheckIcon, ModelLogo } from "../../../components/brand";
import { modelDisplay } from "../../../prompt/models";

import { useT } from "../../../i18n";
/**
 * WHAT ANSWERS WHEN A CONVERSATION IS OPENED — named at the top of the screen.
 *
 * This page's setting is ONE choice, but its result was readable nowhere:
 * you had to scroll through ~400 cards and spot the one with a checkmark (reported
 * on 11/08). A setting whose value you cannot read is not a setting.
 *
 * The row is a BUTTON, and its only gesture shows the model's card in the right
 * panel — never changing the default: you don't change a setting by clicking its
 * statement. Absent when no model matches (an account with no access), rather than an
 * empty state that would read as a failure.
 */
export function DefaultModelSummary({
  model,
  onPreview,
}: {
  model: ModelInfo | undefined;
  /** Show this model's card in the detail panel. */
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
