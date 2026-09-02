import { PROVIDERS, type ModelInfo } from "@openmasq/llm";
import { modelPriceTier } from "../../prompt/modelFilter";
import type { UnavailableReason } from "../../send/modelAvailability";
import { FamilyLogo, SearchIcon, SettingsIcon } from "../brand";
import { ModelRow } from "./ModelRow";
import { PriceTierSelect } from "./PriceTierSelect";
import { favoriteSet } from "./simpleList";
import { factorySimpleIds } from "../../prompt/defaultModel";
import { providerGroupLabel } from "./providers";
import { useFinderNav } from "./useFinderNav";

import { useT } from "../../i18n";
/** Fixed-viewport placement for the menu (portaled to `body` by `ModelSelector`). */
export interface MenuPos {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

/**
 * The chat model picker as a Mac-Finder / miller-columns browser: Provider → vendor
 * Family → Model, plus a free-text search that flattens to a single result list. It
 * replaces the flat dropdown, which the ~320-model OpenRouter catalogue made unreadable.
 * Reuses the SAME family logic as the Settings grid (`prompt/modelFilter`). State + key
 * navigation live in `useFinderNav`; this is presentation only.
 */
export function FinderMenu({
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
  onOpenSettings,
  onSimplify,
}: {
  value: string;
  available: ModelInfo[];
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** The user's favorites — each row's star reflects them. */
  favorites?: readonly string[];
  /** Pin/remove a model. Absent ⇒ no star. */
  onToggleFavorite?: (id: string) => void;
  /** The default model for new conversations, marked with a filled house. */
  defaultModelId?: string;
  /** Make it the default model. Absent ⇒ no house marker. */
  onSetDefault?: (id: string) => void;
  /** Fixed-viewport placement (left/width/maxHeight + top OR bottom), measured by the
   *  caller so the menu clamps to the screen and flips above/below where there's room. */
  pos: MenuPos;
  onChoose: (id: string) => void;
  onClose: () => void;
  /** Open the « Modèles gratuits » explainer from a badge (also closes the menu). */
  onAccessInfo?: (focus: "free" | "credits" | "key", providerLabel?: string) => void;
  /** Open Réglages → Modèles (keys, default model) — closes the menu first. */
  onOpenSettings?: () => void;
  /** Switch back to the SIMPLIFIED view. The menu stays open — the toggle must work in
   *  both directions at the same cost, or the short view is a one-way trip. */
  onSimplify?: () => void;
}) {
  const t = useT();
  const {
    query, setQuery, price, setPrice,
    providers, families, familyModels, results,
    selProvider, selFamily, focusId, setFocusId, col, setCol,
    inputRef, focusRef, reasonOf, pickProvider, pickFamily, choose, onKeyDown,
  } = useFinderNav({ value, available, unavailableModels, onChoose, onClose });
  // Default catalogue shown fully starred when empty — consistent with the simplified
  // menu and with `toggleFavoriteModel`, which materializes this same default on the first gesture.
  const favSet = favoriteSet(favorites, factorySimpleIds(unavailableModels));
  // One tier across the whole list ⇒ no price filter (a menu with one answer).
  const priceTiers = new Set(available.map((m) => modelPriceTier(m.id))).size;

  return (
    <div
      className="model-finder"
      style={{
        position: "fixed",
        left: pos.left,
        width: pos.width,
        // FIXED height (not max-height): the frame must not grow/shrink with the
        // selected provider's column content — a miller-columns browser keeps a
        // stable viewport and scrolls inside it.
        height: pos.maxHeight,
        ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
      }}
      onKeyDown={onKeyDown}
    >
      <div className="model-search">
        <SearchIcon size={15} />
        <input
          ref={inputRef}
          placeholder={t.modelPicker.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* The toolbar strip under the search: the price DROPDOWN (the Settings grid's
          `PriceTierSelect`, narrowing every column + the search — absent when the list
          holds one tier), then the view toggle and the settings gear on the right. */}
      <div className="model-finder-tools" role="group" aria-label={t.modelPicker.priceFilter}>
        {priceTiers > 1 && <PriceTierSelect price={price} onPrice={setPrice} />}
        <span className="flex-spacer" />
        {onSimplify && (
          <button
            type="button"
            className="model-price-chip"
            title={t.modelPicker.simpleViewTip}
            onClick={onSimplify}
          >
                          {t.modelPicker.simpleView}

          </button>
        )}
        {onOpenSettings && (
          <button
              type="button"
              className="model-gear"
              title={t.modelPicker.manage}
              aria-label={t.modelPicker.manage}
              onClick={onOpenSettings}
            >
              <SettingsIcon size={14} />
            </button>
        )}
      </div>

      {results ? (
        <div className="model-finder-results">
          {results.length === 0 && <div className="model-empty">{t.modelPicker.none}</div>}
          {results.map((m) => (
            <ModelRow
              key={m.id}
              ref={m.id === focusId ? focusRef : undefined}
              model={m}
              selected={m.id === value}
              focused={m.id === focusId}
              reason={reasonOf(m.id)}
              // Same rule as the column mode: greyed + tooltip carry the reason —
              // a chip on every blocked row of a 300-model result list is noise.
              suppressChip
              favorite={favSet.has(m.id)}
              onToggleFavorite={onToggleFavorite}
              isDefault={!!defaultModelId && m.id === defaultModelId}
              onSetDefault={onSetDefault}
              onAccessInfo={onAccessInfo}
              onChoose={choose}
              onHover={setFocusId}
            />
          ))}
        </div>
      ) : (
        <div className="model-finder-cols">
          <div className={`model-finder-col${col === 0 ? " active" : ""}`}>
            {providers.map((pid) => {
              const count = available.filter((m) => m.provider === pid).length;
              return (
                <button
                  key={pid}
                  className={`model-finder-item${pid === selProvider ? " on" : ""}`}
                  onMouseEnter={() => pickProvider(pid)}
                  onClick={() => setCol(1)}
                >
                  {/* The provider's REAL logo (the family key equals the provider id, so
                      familyKey={pid} resolves OpenAI→ChatGPT, Scaleway→Scaleway, OpenRouter
                      Zen→its mark, Local→Ollama…; OpenRouter falls back to a monogram). */}
                  <FamilyLogo familyKey={pid} label={PROVIDERS[pid].label} size={18} />
                  <span className="model-finder-label">{providerGroupLabel(pid)}</span>
                  <span className="model-finder-count">{count}</span>
                </button>
              );
            })}
          </div>

          <div className={`model-finder-col${col === 1 ? " active" : ""}`}>
            {families.map((f) => (
              <button
                key={f.key}
                className={`model-finder-item${f.key === selFamily ? " on" : ""}`}
                onMouseEnter={() => pickFamily(f.key)}
                onClick={() => setCol(2)}
              >
                <FamilyLogo familyKey={f.key} label={f.label} size={17} />
                <span className="model-finder-label">{f.label}</span>
                <span className="model-finder-count">{f.models.length}</span>
              </button>
            ))}
          </div>

          <div className={`model-finder-col wide${col === 2 ? " active" : ""}`}>
            {familyModels.map((m) => (
              <ModelRow
                key={m.id}
                ref={m.id === focusId ? focusRef : undefined}
                model={m}
                selected={m.id === value}
                focused={m.id === focusId}
                reason={reasonOf(m.id)}
                suppressChip
                favorite={favSet.has(m.id)}
                onToggleFavorite={onToggleFavorite}
                isDefault={!!defaultModelId && m.id === defaultModelId}
                onSetDefault={onSetDefault}
                onAccessInfo={onAccessInfo}
                onChoose={choose}
                onHover={setFocusId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
