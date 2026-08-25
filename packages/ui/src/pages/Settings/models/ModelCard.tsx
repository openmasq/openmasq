import { PROVIDERS, type ModelInfo } from "@openmasq/llm";
import { CheckIcon, ModelLogo, StarIcon } from "../../../components/brand";
import { CountryFlag } from "../../../components/media/CountryFlag";
import { pickerBlocks, unavailableLabel, type UnavailableReason } from "../../../send/modelAvailability";
import { modelDisplay } from "../../../prompt/models";
import { captureEvent } from "../../../analytics";

/**
 * One selectable model card in the default-model picker. Extracted from `ModelsTab`
 * so the grid can be rendered both flat and inside a vendor-family sub-group without
 * duplicating the button. Unusable models render GREYED + `aria-disabled` (not
 * `disabled`) so they still drive the detail panel on hover; the fix (a missing key)
 * is the provider group's header gear.
 */
export function ModelCard({
  model,
  active,
  reason,
  showChip,
  onPreview,
  onPick,
  onAccessInfo,
  favorite,
  onToggleFavorite,
}: {
  model: ModelInfo;
  active: boolean;
  /** Why it can't send right now (greys the card), or undefined. */
  reason: UnavailableReason | undefined;
  /** Show the per-card unavailable chip — only when the provider group is MIXED (a
   *  uniform group states the reason once in its header). */
  showChip: boolean;
  onPreview: (id: string) => void;
  onPick: (id: string) => void;
  /** Open the « Modèles gratuits » explainer (badge click). */
  onAccessInfo?: (focus: "free" | "credits" | "key", providerLabel?: string) => void;
  /** Ce modèle est-il un favori (liste courte du sélecteur) ? */
  favorite?: boolean;
  /** Épingler/retirer des favoris. Absent ⇒ pas d'étoile. */
  onToggleFavorite?: (id: string) => void;
}) {
  const unavailable = reason ? unavailableLabel(reason, PROVIDERS[model.provider].label) : null;
  // Only a HARD reason (nothing to call) disables the card — a subscription/key-gated
  // model stays pickable, the send's inline container explains the escapes.
  const hardBlocked = !!reason && pickerBlocks(reason);
  const display = modelDisplay(model);
  return (
    <button
      className={`model-card ${active ? "active" : ""}${hardBlocked ? " unavailable" : ""}`}
      title={unavailable?.title}
      aria-disabled={hardBlocked}
      onMouseEnter={() => onPreview(model.id)}
      onFocus={() => onPreview(model.id)}
      onClick={() => {
        if (hardBlocked) return;
        captureEvent({ name: "default_model_set", model: model.id });
        onPick(model.id);
      }}
    >
      <ModelLogo provider={model.provider} modelId={model.id} size={28} tile />
      <div className="model-card-body">
        <div className="model-card-name">{display.label}</div>
        <div className="model-card-vendor">
          <CountryFlag host={PROVIDERS[model.provider].hostCountry} size={12} />
          {/* The provider label is the ELLIPSING part — the badges must never wrap or
              push the card wider (flex row + min-width:0, see `.model-card-vendor`). */}
          <span className="model-card-provider">{PROVIDERS[model.provider].label}</span>
          {display.free && (
            /* The card is a <button> — role=button span + stopPropagation, so the badge
               opens the explainer without picking the model. */
            <span
              className={`model-free-badge${onAccessInfo ? " clickable" : ""}`}
              title="Modèle gratuit — usage limité, sans abonnement. Cliquez pour en savoir plus."
              role={onAccessInfo ? "button" : undefined}
              tabIndex={onAccessInfo ? 0 : undefined}
              onClick={
                onAccessInfo
                  ? (ev) => {
                      ev.stopPropagation();
                      onAccessInfo("free");
                    }
                  : undefined
              }
            >
              gratuit
            </span>
          )}
          {unavailable && showChip && <span className="model-unavailable">{unavailable.chip}</span>}
        </div>
      </div>
      {onToggleFavorite && (
        /* La carte est un <button> — role=button span + stopPropagation, pour épingler
           sans faire de ce modèle le modèle PAR DÉFAUT (le clic de la carte). */
        <span
          className={`model-fav${favorite ? " on" : ""}`}
          role="button"
          tabIndex={0}
          title={favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={favorite}
          onClick={(ev) => {
            ev.stopPropagation();
            onToggleFavorite(model.id);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              ev.stopPropagation();
              onToggleFavorite(model.id);
            }
          }}
        >
          <StarIcon size={15} filled={favorite} />
        </span>
      )}
      {active && (
        <span className="model-card-check">
          <CheckIcon size={16} />
        </span>
      )}
    </button>
  );
}
