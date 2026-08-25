import { forwardRef } from "react";
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
    /** Vue SIMPLIFIÉE : la ligne se réduit au logo, au nom et au badge « gratuit ».
     *  Ni drapeau ni ligne prix/contexte/débit — pas parce que ces faits seraient faux,
     *  mais parce qu'ils demandent un arbitrage à qui a justement demandé à ne pas en
     *  faire. Ils restent tous dans la vue complète, à un clic. */
    compact?: boolean;
    onChoose: (id: string) => void;
    onHover: (id: string) => void;
    /** Ce modèle est-il un favori ? Absent avec `onToggleFavorite` ⇒ pas d'étoile. */
    favorite?: boolean;
    /** Épingler/retirer ce modèle des favoris. Absent ⇒ aucune étoile n'est rendue (les
     *  surfaces sans réglage — aperçu web, harnais de test — ne l'offrent pas). */
    onToggleFavorite?: (id: string) => void;
    /** Ce modèle est-il le modèle PAR DÉFAUT (des nouvelles conversations) ? */
    isDefault?: boolean;
    /** En faire le modèle par défaut. Absent ⇒ aucun marqueur maison n'est rendu. */
    onSetDefault?: (id: string) => void;
    /** Open the « accès aux modèles » explainer — from the « gratuit » badge OR from
     *  the unavailable chip, which otherwise carries its escapes in a hover-only
     *  `title=` no touch screen can read. Absent = plain, non-interactive badge/chip. */
    onAccessInfo?: (focus: "free" | "credits" | "key", providerLabel?: string) => void;
  }
>(function ModelRow({ model, selected, focused, reason, suppressChip, compact, onChoose, onHover, onAccessInfo, favorite, onToggleFavorite, isDefault, onSetDefault }, ref) {
  const meta = modelMeta(model.id);
  const display = modelDisplay(model);
  const unavailable = reason ? unavailableLabel(reason, PROVIDERS[model.provider].label) : null;
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
                title="Comment utiliser ce modèle ?"
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
            {/* Le drapeau (juridiction d'hébergement) vit sur la ligne MÉTA : c'en est
                une, et la ligne du nom — la plus disputée — lui coûtait un repli. */}
            <CountryFlag host={PROVIDERS[model.provider].hostCountry} size={12} />
            {/* Icône = le référent, valeur nue = la place, `title` = le mot + l'unité
                (`TooltipLayer` le dessine) — le contrat de `modelMeta` (14/08). */}
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
        /* Le marqueur MODÈLE PAR DÉFAUT — plein sur le défaut actuel, cliquable sur les
           autres pour le devenir. role=button span + stopPropagation, comme l'étoile :
           le clic ne CHOISIT pas le modèle pour la conversation. Sur le défaut lui-même
           il est inerte (aria-disabled) — informatif, pas une action. */
        <span
          className={`model-default${isDefault ? " on" : ""}`}
          role="button"
          tabIndex={isDefault ? -1 : 0}
          aria-disabled={isDefault}
          title={isDefault ? "Modèle par défaut des nouvelles conversations" : "Définir comme modèle par défaut"}
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
        /* La ligne est déjà un <button> : l'étoile est un role=button span +
           stopPropagation, sinon l'épingler CHOISIRAIT le modèle. */
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
    </button>
  );
});
