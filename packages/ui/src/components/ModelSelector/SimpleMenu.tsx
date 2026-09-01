import { Fragment, useEffect, useRef, useState } from "react";
import type { ModelInfo } from "@openmasq/llm";
import type { UnavailableReason } from "../../send/modelAvailability";
import { ExpandIcon } from "../brand";
import type { MenuPos } from "./FinderMenu";
import { ModelRow } from "./ModelRow";
import { favoriteSet, simpleMenuModels, simpleMenuSections } from "./simpleList";

import { useT } from "../../i18n";
/**
 * The SIMPLIFIED view of the selector: a short list, not a navigator. No columns,
 * no search, no price filters — on five entries, each of these tools costs
 * more attention than it saves.
 *
 * It isn't a degraded mode: « Tous les modèles » stays visible at all times, at the
 * bottom, and switches without closing the menu. A choice you can't undo in one click isn't
 * a simplification, it's a wall.
 */
export function SimpleMenu({
  value,
  available,
  unavailableModels,
  favorites,
  onToggleFavorite,
  defaultModelId,
  onSetDefault,
  pos,
  onChoose,
  onClose,
  onAccessInfo,
  onShowAll,
}: {
  value: string;
  available: ModelInfo[];
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** The user's favorites (`Settings.favoriteModels`) — empty ⇒ the default catalogue. */
  favorites?: readonly string[];
  /** Pin/remove a model. Absent ⇒ no star. */
  onToggleFavorite?: (id: string) => void;
  /** The default model for new conversations (`Settings.defaultModelId`). */
  defaultModelId?: string;
  /** Make it the default model. Absent ⇒ no home marker. */
  onSetDefault?: (id: string) => void;
  pos: MenuPos;
  onChoose: (id: string) => void;
  onClose: () => void;
  onAccessInfo?: (focus: "free" | "credits" | "key", providerLabel?: string) => void;
  /** Switch to the full view (all providers) — the menu STAYS open. */
  onShowAll: () => void;
}) {
  const t = useT();
  const favSet = favoriteSet(favorites);
  // The BLOCKS decide the displayed order (the default goes to the front); `models` is
  // its flattening, and it's THAT which the keyboard follows — two orders, one for the eye
  // and the other for the arrows: it's the DOWN arrow that skips a line.
  const sections = simpleMenuSections(
    simpleMenuModels(available, value, favorites),
    { favSet, defaultId: defaultModelId },
    t,
  );
  const models = sections.flatMap((s) => s.models);
  const [focusId, setFocusId] = useState(() => (models.some((m) => m.id === value) ? value : models[0]?.id) ?? "");
  const focusRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // The menu takes focus on open: without that the arrows scroll the PAGE behind it
  // (there's no search field here to catch them, unlike the Finder).
  useEffect(() => {
    rootRef.current?.focus();
  }, []);
  // ⚠️ Not on the FIRST render. The initial focus is the current model, which can be the
  // last row (the one added outside favorites): scrolling to it on open showed the
  // list already scrolled down, first entry clipped — you're opening a menu, not resuming a
  // navigation. Scrolling only serves the arrows.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    focusRef.current?.scrollIntoView({ block: "nearest" });
  }, [focusId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    const i = models.findIndex((m) => m.id === focusId);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? i + 1 : i - 1;
      const clamped = Math.max(0, Math.min(models.length - 1, next));
      setFocusId(models[clamped]?.id ?? focusId);
      return;
    }
    if (e.key === "Enter" && focusId) {
      e.preventDefault();
      onChoose(focusId);
    }
  };

  return (
    <div
      ref={rootRef}
      className="model-finder simple"
      tabIndex={-1}
      role="listbox"
      aria-label={t.modelPicker.models}
      style={{
        position: "fixed",
        left: pos.left,
        width: Math.min(pos.width, 340),
        maxHeight: pos.maxHeight,
        ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
      }}
      onKeyDown={onKeyDown}
    >
      <div className="model-simple-list">
        {models.length === 0 && <div className="model-empty">{t.modelPicker.none}</div>}
        {/* One heading per block — « ces cinq-là, pourquoi ? ». `simpleMenuSections`
            composes them (and renders none of them empty); the view just unrolls them. */}
        {sections.map((sec) => (
          <Fragment key={sec.label}>
            <div className="model-simple-sep">{sec.label}</div>
            {sec.models.map((m) => (
              <ModelRow
                key={m.id}
                ref={m.id === focusId ? focusRef : undefined}
                model={m}
                selected={m.id === value}
                focused={m.id === focusId}
                reason={unavailableModels?.get(m.id)}
                compact
                favorite={favSet.has(m.id)}
                onToggleFavorite={onToggleFavorite}
                isDefault={!!defaultModelId && m.id === defaultModelId}
                onSetDefault={onSetDefault}
                onAccessInfo={onAccessInfo}
                onChoose={onChoose}
                onHover={setFocusId}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <button type="button" className="model-simple-all" onClick={onShowAll}>
        <ExpandIcon size={14} />
        {t.modelPicker.allModels}
      </button>
    </div>
  );
}
