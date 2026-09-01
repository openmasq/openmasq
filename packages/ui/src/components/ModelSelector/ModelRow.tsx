import { forwardRef } from "react";
import { useT } from "../../i18n";
import { PROVIDERS, type ModelInfo } from "@openmasq/llm";
import { modelDisplay } from "../../prompt/models";
import { modelMeta } from "../../prompt/modelMeta";
import { pickerBlocks, unavailableLabel, type UnavailableReason } from "../../send/modelAvailability";
import { BookOpenIcon, CheckIcon, CoinsIcon, GaugeIcon, HouseIcon, ModelLogo, StarIcon } from "../brand";
import { CountryFlag } from "../media/CountryFlag";

/**
 * One model row in the Finder's rightmost column (and the flat search results). An
 * unavailable model shows its reason inline (unless the caller already states it once
 * above — `suppressChip`), but only a HARD reason (`pickerBlocks`: nothing to call)
 * greys + disables the row: a subscription/key-gated model stays SELECTABLE, and the
 * send's inline container explains the escapes (abonnement / clé) with their CTAs.
 */
export const ModelRow = forwardRef<
  HTMLButtonElement,
  {
    model: ModelInfo;
    selected: boolean;
    focused: boolean;
    reason: UnavailableReason | undefined;
    suppressChip?: boolean;
    /** SIMPLIFIED view: the row reduces to the logo, the name and the « gratuit » badge.
     *  Neither flag nor price/context/throughput line — not because these facts would be false,
     *  but because they demand a trade-off from someone who precisely asked not to
     *  make one. They all stay in the full view, one click away. */
    compact?: boolean;
    onChoose: (id: string) => void;
    onHover: (id: string) => void;
    /** Is this model a favorite? Absent with `onToggleFavorite` ⇒ no star. */
    favorite?: boolean;
    /** Pin/remove this model from favorites. Absent ⇒ no star is rendered (surfaces
     *  with no settings — web preview, test harness — don't offer it). */
    onToggleFavorite?: (id: string) => void;
    /** Is this model the DEFAULT model (for new conversations)? */
    isDefault?: boolean;
    /** Make it the default model. Absent ⇒ no house marker is rendered. */
    onSetDefault?: (id: string) => void;
    /** Open the « accès aux modèles » explainer — from the « gratuit » badge OR from
     *  the unavailable chip, which otherwise carries its escapes in a hover-only
     *  `title=` no touch screen can read. Absent = plain, non-interactive badge/chip. */
    onAccessInfo?: (focus: "free" | "credits" | "key", providerLabel?: string) => void;
  }
>(function ModelRow({ model, selected, focused, reason, suppressChip, compact, onChoose, onHover, onAccessInfo, favorite, onToggleFavorite, isDefault, onSetDefault }, ref) {
  const t = useT();
  const meta = modelMeta(model.id);
  const display = modelDisplay(model);
  const unavailable = reason ? unavailableLabel(reason, PROVIDERS[model.provider].label, t) : null;
  const hardBlocked = !!reason && pickerBlocks(reason);
  return (
    <button
      ref={ref}
      className={`model-option ${selected ? "active" : ""}${focused ? " focus" : ""}${hardBlocked ? " unavailable" : ""}${compact ? " compact" : ""}`}
      disabled={hardBlocked}
      title={unavailable?.title}
      onClick={() => onChoose(model.id)}
      onMouseMove={() => onHover(model.id)}
    >
      <ModelLogo provider={model.provider} modelId={model.id} size={24} tile />
      <div className="model-option-body">
        <div className="model-option-name">
          <strong>{display.label}</strong>
          {display.free && (
            /* A row is already a <button>, so the badge is a role=button span —
               stopPropagation keeps a badge click from PICKING the model. */
            <span
              className={`model-free-badge${onAccessInfo ? " clickable" : ""}`}
              title={t.modelPicker.freeTip}
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
              onKeyDown={
                onAccessInfo
                  ? (ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        ev.stopPropagation();
                        onAccessInfo("free");
                      }
                    }
                  : undefined
              }
            >
              gratuit
            </span>
          )}
        </div>
        {unavailable && !suppressChip && (
          <div className="model-option-desc">
            {onAccessInfo && reason && !hardBlocked ? (
              /* The chip ANSWERS its own question: what to do about it. A row is already
                 a <button>, so this is a role=button span + stopPropagation. */
              <span
                className="model-unavailable clickable"
                role="button"
                tabIndex={0}
                title={t.modelPicker.howToUse}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onAccessInfo(reason === "no_key" ? "key" : "credits", PROVIDERS[model.provider].label);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    ev.stopPropagation();
                    onAccessInfo(reason === "no_key" ? "key" : "credits", PROVIDERS[model.provider].label);
                  }
                }}
              >
                {unavailable.chip} — comment faire ?
              </span>
            ) : (
              <span className="model-unavailable">{unavailable.chip}</span>
            )}
          </div>
        )}
        {!compact && (meta.price || meta.context || meta.tpm) && (
          <div className="model-option-meta">
            {/* The flag (hosting jurisdiction) lives on the META line: it IS
                one, and the name line — the most contested — cost it a wrap. */}
            <CountryFlag host={PROVIDERS[model.provider].hostCountry} size={12} />
            {/* Icon = the referent, bare value = the space, `title` = the word + the unit
                (`TooltipLayer` draws it) — `modelMeta`'s contract (14/08). */}
            {meta.price && (
              <span className="model-meta" title={meta.priceTitle}>
                <CoinsIcon size={11} />
                {meta.price}
              </span>
            )}
            {meta.context && (
              <span className="model-meta" title={meta.contextTitle}>
                <BookOpenIcon size={11} />
                {meta.context}
              </span>
            )}
            {meta.tpm && (
              <span className={`model-meta${meta.tpmLow ? " warn" : ""}`} title={meta.tpmTitle}>
                <GaugeIcon size={11} />
                {meta.tpm}
              </span>
            )}
          </div>
        )}
      </div>
      {selected && (
        <span className="check">
          <CheckIcon size={15} />
        </span>
      )}
      {onSetDefault && (
        /* The DEFAULT MODEL marker — filled on the current default, clickable on
           others to become it. role=button span + stopPropagation, like the star:
           the click does NOT CHOOSE the model for the conversation. On the default itself
           it's inert (aria-disabled) — informative, not an action. */
        <span
          className={`model-default${isDefault ? " on" : ""}`}
          role="button"
          tabIndex={isDefault ? -1 : 0}
          aria-disabled={isDefault}
          title={isDefault ? t.modelPicker.isDefault : t.modelPicker.setDefault}
          onClick={(ev) => {
            ev.stopPropagation();
            if (!isDefault) onSetDefault(model.id);
          }}
          onKeyDown={(ev) => {
            if ((ev.key === "Enter" || ev.key === " ") && !isDefault) {
              ev.preventDefault();
              ev.stopPropagation();
              onSetDefault(model.id);
            }
          }}
        >
          <HouseIcon size={15} filled={isDefault} />
        </span>
      )}
      {onToggleFavorite && (
        /* The row is already a <button>: the star is a role=button span +
           stopPropagation, otherwise pinning it would CHOOSE the model. */
        <span
          className={`model-fav${favorite ? " on" : ""}`}
          role="button"
          tabIndex={0}
          title={favorite ? t.modelPicker.removeFavorite : t.modelPicker.addFavorite}
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
    </button>
  );
});
