import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PROVIDERS } from "@openmasq/llm";
import { ALL_MODELS, findModelAny, selectableModels } from "../../prompt/models";
import { visibleModels, type UnavailableReason } from "../../send/modelAvailability";
import { AUTO_MODEL_LABEL, isAutoModelId } from "../../send/autoRoute";
import { ChevDownIcon, ModelLogo, ZapIcon } from "../brand";
import { CountryFlag } from "../media/CountryFlag";
import { FinderMenu, type MenuPos } from "./FinderMenu";
import { SimpleMenu } from "./SimpleMenu";

const MARGIN = 12;
const GAP = 8;
const MAX_W = 640;
const MAX_H = 330;

interface Props {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** Org-disallowed model ids — hidden from the picker (the send also blocks them). */
  /** Allow-list de l'organisation ; `undefined` = compte solo, tout est offert. */
  allowedModelIds?: string[];
  /** Model id → why it can't send (`store.unavailableModels`). A row carries its
   *  reason as a chip/tooltip; only a HARD reason (`pickerBlocks` — nothing to call)
   *  greys + disables it. A subscription/key-gated model stays selectable — the send's
   *  inline container explains the escapes. Absent ⇒ nothing flagged. */
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** Open the « Modèles gratuits » explainer (a « gratuit » badge was clicked). */
  onAccessInfo?: (focus: "free" | "credits" | "key", providerLabel?: string) => void;
  /** Open Réglages → Modèles from the finder's gear. */
  onOpenModelSettings?: () => void;
  /** Vue SIMPLIFIÉE (`Settings.modelPickerSimple`) : une liste courte de favoris au lieu
   *  du navigateur à colonnes. Le réglage n'agit que sur ce que le menu MONTRE — il ne
   *  change jamais le modèle sélectionné. */
  simple?: boolean;
  /** Bascule persistée entre les deux vues, depuis le menu lui-même. Absente ⇒ le menu
   *  n'offre pas la bascule (la vue reste celle que le parent impose). */
  onSimpleChange?: (simple: boolean) => void;
  /** Les modèles FAVORIS de l'utilisateur (`Settings.favoriteModels`) — la liste courte.
   *  Vide/absent ⇒ le défaut gouvernable du catalogue. */
  favoriteModels?: string[];
  /** Épingler/retirer un modèle des favoris. Absente ⇒ aucune étoile (aperçu web, tests). */
  onToggleFavorite?: (id: string) => void;
  /** Le modèle par défaut des nouvelles conversations (`Settings.defaultModelId`) —
   *  marqué d'une maison pleine dans le menu. */
  defaultModelId?: string;
  /** En faire le modèle par défaut, depuis le menu. Absente ⇒ pas de marqueur maison. */
  onSetDefault?: (id: string) => void;
}

/**
 * The chat's model picker: a compact chip that opens a Mac-Finder / miller-columns
 * browser (Provider → vendor Family → Model) — the readable replacement for the flat
 * dropdown, which the ~320-model OpenRouter catalogue made unusable. The columns +
 * search live in `FinderMenu`; this owns only the chip and open/close.
 */
export function ModelSelector({ value, onChange, disabled, allowedModelIds, unavailableModels, onAccessInfo, onOpenModelSettings, simple, onSimpleChange, favoriteModels, onToggleFavorite, defaultModelId, onSetDefault }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Fixed-viewport placement, measured on open. The menu is PORTALED to <body> (below) so
  // it escapes the split-pane's `overflow:hidden`, which clipped an in-flow menu; the coords
  // clamp to the viewport and flip the menu DOWN when there's little room above (the
  // startup/empty screen centres the composer, leaving scant space over it).
  const [pos, setPos] = useState<MenuPos | null>(null);
  // Le mode AUTO n'est pas un id du registre : la puce porte alors son propre glyphe et
  // « Auto » — jamais le repli `ALL_MODELS[0]`, qui afficherait un modèle que rien n'a choisi.
  const auto = isAutoModelId(value);
  const current = findModelAny(value) ?? ALL_MODELS[0];
  // Ce que ce compte peut RÉELLEMENT envoyer (abonnement, clés, gratuits) — plus le
  // modèle COURANT, qui reste listé même si sa clé vient d'être retirée, sinon la
  // conversation afficherait un choix absent de sa propre liste. `visibleModels` est
  // le seul endroit qui décide de masquer (`send/modelAvailability.ts`).
  const available = useMemo(
    () => visibleModels(selectableModels(allowedModelIds), unavailableModels, value),
    [allowedModelIds, unavailableModels, value],
  );

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(MAX_W, vw - 2 * MARGIN);
    // Left-align to the chip, then clamp so the (wider-than-chip) menu stays on screen —
    // in a narrow split pane it extends over the sibling pane rather than being cut off.
    const left = Math.max(MARGIN, Math.min(r.left, vw - width - MARGIN));
    const above = r.top - MARGIN - GAP;
    const below = vh - r.bottom - MARGIN - GAP;
    const up = above >= below;
    const maxHeight = Math.max(200, Math.min(MAX_H, up ? above : below));
    setPos(
      up
        ? { left, width, maxHeight, bottom: vh - r.top + GAP }
        : { left, width, maxHeight, top: r.bottom + GAP },
    );
  }, [open]);

  // Close on Escape / outside click (the scrim) / a scroll or resize that would drift the
  // fixed menu away from its chip.
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // The capture-phase scroll listener also fires for the menu's OWN scrollable columns
    // (the model list's scrollbar), which must NOT close it — only a scroll of the PAGE
    // behind it drifts the fixed menu from its chip. So ignore scrolls that originate
    // inside the portaled `.model-finder`.
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof Element && t.closest(".model-finder")) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <div className="model-selector" ref={rootRef}>
      <button
        className={`model-chip ${open ? "open" : ""}`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {auto ? (
          <ZapIcon size={16} />
        ) : (
          <ModelLogo provider={current.provider} modelId={current.id} size={16} />
        )}
        {/* Wrapped, not a bare text node: as a flex item a bare node keeps
            `min-width:auto`, so the chip could never yield width and the composer row
            overflowed sideways whenever the send button morphed (« Redaction »). */}
        <span className="model-chip-label">{auto ? AUTO_MODEL_LABEL : current.label}</span>
        {!auto && <CountryFlag host={PROVIDERS[current.provider].hostCountry} size={12} />}
        <span className="chev">
          <ChevDownIcon size={14} />
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="menu-scrim" onClick={() => setOpen(false)} />
            {simple && onSimpleChange ? (
              <SimpleMenu
                value={value}
                available={available}
                unavailableModels={unavailableModels}
                favorites={favoriteModels}
                onToggleFavorite={onToggleFavorite}
                defaultModelId={defaultModelId}
                onSetDefault={onSetDefault}
                pos={pos}
                onChoose={(id) => {
                  onChange(id);
                  setOpen(false);
                }}
                onClose={() => setOpen(false)}
                onAccessInfo={
                  onAccessInfo
                    ? (focus, providerLabel) => {
                        setOpen(false);
                        onAccessInfo(focus, providerLabel);
                      }
                    : undefined
                }
                // La bascule ne FERME pas le menu : on vient de demander à voir plus,
                // pas à partir. Le Finder se monte à la place, au même endroit.
                onShowAll={() => onSimpleChange(false)}
              />
            ) : (
            <FinderMenu
              value={value}
              available={available}
              unavailableModels={unavailableModels}
              favorites={favoriteModels}
              onToggleFavorite={onToggleFavorite}
              defaultModelId={defaultModelId}
              onSetDefault={onSetDefault}
              pos={pos}
              onChoose={(id) => {
                onChange(id);
                setOpen(false);
              }}
              onClose={() => setOpen(false)}
              onSimplify={onSimpleChange ? () => onSimpleChange(true) : undefined}
              onAccessInfo={
                onAccessInfo
                  ? (focus, providerLabel) => {
                      setOpen(false); // the explainer replaces the menu, not stacks on it
                      onAccessInfo(focus, providerLabel);
                    }
                  : undefined
              }
              onOpenSettings={
                onOpenModelSettings
                  ? () => {
                      setOpen(false); // navigating away — the menu must not linger
                      onOpenModelSettings();
                    }
                  : undefined
              }
            />
            )}
          </>,
          document.body,
        )}
    </div>
  );
}
