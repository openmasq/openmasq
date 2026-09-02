import { forwardRef, useCallback, useState, type MouseEvent, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../i18n";
import { PROVIDERS, type ModelInfo } from "@openmasq/llm";
import { modelDisplay } from "../../prompt/models";
import { modelMeta } from "../../prompt/modelMeta";
import { usePopover } from "../../hooks/usePopover";
import { pickerBlocks, unavailableLabel, type UnavailableReason } from "../../send/modelAvailability";
import { BookOpenIcon, CheckIcon, CoinsIcon, DotsIcon, GaugeIcon, HouseIcon, ModelLogo, StarIcon } from "../brand";
import { CountryFlag } from "../media/CountryFlag";

/**
 * One model row in the Finder's rightmost column (and the flat search results). An
 * unavailable model shows its reason inline (unless the caller already states it once
 * above — `suppressChip`), but only a HARD reason (`pickerBlocks`: nothing to call)
 * greys + disables the row: a subscription/key-gated model stays listed, and its BODY
 * then opens the access explainer (`onAccessInfo`) instead of choosing it — the
 * « gratuit » badge and the reason chip are no longer targets of their own.
 *
 * Two gestures per row, not three: the BODY (use this model) and the STAR (favourite).
 * « Définir par défaut » lives in a CONTEXT MENU — a right-click anywhere on the row,
 * or the « ⋯ » that appears on hover in the full view; the simplified view draws no ⋯
 * at all (body + star only, the right-click stays). A third always-drawn gesture on
 * ~70 rows was noise, and the house's meaning (« défaut des NOUVELLES conversations »)
 * needs the sentence the menu item carries.
 */

/** The context menu's width (`.model-row-pop` min-width) — for the right-edge clamp. */
const MENU_W = 220;

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
    /** Make it the default model — the context menu's item. Absent ⇒ no menu, no ⋯. */
    onSetDefault?: (id: string) => void;
    /** Open the « accès aux modèles » explainer: the BODY of a gated row calls it
     *  (with the route the user bumped into) instead of choosing a model that cannot
     *  send. Absent = the body chooses, whatever the reason. */
    onAccessInfo?: (focus: "free" | "credits" | "key", providerLabel?: string) => void;
  }
>(function ModelRow({ model, selected, focused, reason, suppressChip, compact, onChoose, onHover, onAccessInfo, favorite, onToggleFavorite, isDefault, onSetDefault }, ref) {
  const t = useT();
  const meta = modelMeta(model.id);
  const display = modelDisplay(model);
  const unavailable = reason ? unavailableLabel(reason, PROVIDERS[model.provider].label, t) : null;
  const hardBlocked = !!reason && pickerBlocks(reason);
  // The context menu (default model). Open state, Escape and outside-click come from
  // `usePopover`; the PLACEMENT is ours — a right-click opens at the pointer, the ⋯
  // under itself — so no `anchor`. The ROW is the trigger (a click on it must not
  // count as "outside" and reopen what it just closed), hence the merged ref.
  const menu = usePopover<HTMLButtonElement, HTMLDivElement>({ closeOnScroll: true });
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const rowRef = useCallback(
    (el: HTMLButtonElement | null) => {
      (menu.triggerRef as MutableRefObject<HTMLButtonElement | null>).current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as MutableRefObject<HTMLButtonElement | null>).current = el;
    },
    [menu.triggerRef, ref],
  );
  const openMenuAt = (left: number, top: number) => {
    if (!onSetDefault) return;
    setMenuPos({
      left: Math.max(8, Math.min(left, window.innerWidth - MENU_W - 8)),
      top: Math.min(top, window.innerHeight - 56),
    });
    menu.setOpen(true);
  };
  const onContextMenu = (ev: MouseEvent<HTMLButtonElement>) => {
    if (!onSetDefault || hardBlocked) return;
    ev.preventDefault();
    openMenuAt(ev.clientX, ev.clientY);
  };
  const setDefault = () => {
    menu.close();
    if (!isDefault) onSetDefault?.(model.id);
  };
  return (
    <button
      ref={rowRef}
      className={`model-option ${selected ? "active" : ""}${focused ? " focus" : ""}${hardBlocked ? " unavailable" : ""}${compact ? " compact" : ""}`}
      disabled={hardBlocked}
      title={unavailable?.title}
      onClick={() => {
        menu.close();
        // A listed-but-gated model (a key just removed, credits gone): the body answers
        // « comment faire ? » instead of picking a model that cannot send.
        if (reason && onAccessInfo) {
          onAccessInfo(reason === "no_key" ? "key" : "credits", PROVIDERS[model.provider].label);
          return;
        }
        onChoose(model.id);
      }}
      onContextMenu={onContextMenu}
      onMouseMove={() => onHover(model.id)}
    >
      <ModelLogo provider={model.provider} modelId={model.id} size={24} tile />
      <div className="model-option-body">
        <div className="model-option-name">
          <strong>{display.label}</strong>
          {display.free && (
            <span className="model-free-badge" title={t.modelPicker.freeTip}>
              {t.modelsTab.freeBadge}
            </span>
          )}
        </div>
        {unavailable && !suppressChip && (
          <div className="model-option-desc">
            <span className="model-unavailable">{unavailable.chip}</span>
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
      {isDefault && onSetDefault && (
        /* The current default keeps its MARK (information, never an action): the
           filled house, inert. Changing the default is the menu's job. */
        <span className="model-default on" title={t.modelPicker.isDefault} aria-hidden="true">
          <HouseIcon size={15} filled />
        </span>
      )}
      {onSetDefault && !compact && !hardBlocked && (
        /* The « ⋯ » — role=button span + stopPropagation, like the star: opening the
           menu must not CHOOSE the model. Hover-revealed by the stylesheet. */
        <span
          className="model-more"
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          title={t.modelPicker.moreActions}
          onClick={(ev) => {
            ev.stopPropagation();
            const r = ev.currentTarget.getBoundingClientRect();
            if (menu.open) menu.close();
            else openMenuAt(r.right - MENU_W, r.bottom + 4);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              ev.stopPropagation();
              const r = ev.currentTarget.getBoundingClientRect();
              openMenuAt(r.right - MENU_W, r.bottom + 4);
            }
          }}
        >
          <DotsIcon size={15} />
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
      {menu.open &&
        menuPos &&
        onSetDefault &&
        createPortal(
          /* Portaled to <body>, yet a React child of the row: every event would bubble
             to the row's handlers through the portal, so the menu stops them itself.
             Runtime-computed position — the allowed inline-style case. */
          <div
            ref={menu.menuRef}
            className="model-row-pop"
            role="menu"
            style={{ position: "fixed", left: menuPos.left, top: menuPos.top }}
            onClick={(ev) => ev.stopPropagation()}
            onMouseMove={(ev) => ev.stopPropagation()}
            onContextMenu={(ev) => {
              ev.preventDefault();
              ev.stopPropagation();
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="model-row-act"
              disabled={isDefault}
              onClick={setDefault}
            >
              <HouseIcon size={14} filled={isDefault} />
              {isDefault ? t.modelPicker.isDefault : t.modelPicker.setDefault}
            </button>
          </div>,
          document.body,
        )}
    </button>
  );
});

