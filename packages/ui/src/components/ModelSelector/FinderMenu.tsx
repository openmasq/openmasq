import { PROVIDERS, type ModelInfo } from "@openmasq/llm";
import { PRICE_TIERS } from "../../prompt/modelFilter";
import type { UnavailableReason } from "../../send/modelAvailability";
import { FamilyLogo, SearchIcon, SettingsIcon } from "../brand";
import { ModelRow } from "./ModelRow";
import { favoriteSet } from "./simpleList";
import { providerGroupLabel } from "./providers";
import { useFinderNav } from "./useFinderNav";

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
  /** Favoris de l'utilisateur — l'étoile de chaque ligne les reflète. */
  favorites?: readonly string[];
  /** Épingler/retirer un modèle. Absent ⇒ pas d'étoile. */
  onToggleFavorite?: (id: string) => void;
  /** Le modèle par défaut des nouvelles conversations, marqué d'une maison pleine. */
  defaultModelId?: string;
  /** En faire le modèle par défaut. Absent ⇒ pas de marqueur maison. */
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
  /** Repasser en vue SIMPLIFIÉE. Le menu reste ouvert — la bascule doit se faire dans
   *  les deux sens au même coût, sinon la vue courte est un aller sans retour. */
  onSimplify?: () => void;
}) {
  const {
    query, setQuery, price, setPrice,
    providers, families, familyModels, results,
    selProvider, selFamily, focusId, setFocusId, col, setCol,
    inputRef, focusRef, reasonOf, pickProvider, pickFamily, choose, onKeyDown,
  } = useFinderNav({ value, available, unavailableModels, onChoose, onClose });
  // Défaut catalogue affiché tout étoilé quand vide — cohérent avec le menu simplifié
  // et avec `toggleFavoriteModel` qui matérialise ce même défaut au premier geste.
  const favSet = favoriteSet(favorites);

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
          placeholder="Rechercher un modèle (nom, gpt, claude…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Price-tier row — the Settings grid's chips (`.model-price-chip`), narrowing
          every column + the search. A tier click toggles; « Tous » clears. */}
      <div className="model-filter-prices finder" role="group" aria-label="Filtrer par prix de token">
        <span className="model-filter-prices-label">Prix</span>
        <button
          type="button"
          className={`model-price-chip${price === null ? " on" : ""}`}
          onClick={() => setPrice(null)}
        >
          Tous
        </button>
        {PRICE_TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`model-price-chip${price === t.key ? " on" : ""}`}
            title={t.title}
            onClick={() => setPrice(price === t.key ? null : t.key)}
          >
            {t.label}
          </button>
        ))}
        <span className="flex-spacer" />
        {onSimplify && (
          <button
            type="button"
            className="model-price-chip"
            title="Afficher seulement une courte liste de modèles"
            onClick={onSimplify}
          >
            Vue simplifiée
          </button>
        )}
        {onOpenSettings && (
          <button
              type="button"
              className="model-gear"
              title="Gérer les modèles et les clés (Réglages)"
              aria-label="Gérer les modèles et les clés (Réglages)"
              onClick={onOpenSettings}
            >
              <SettingsIcon size={14} />
            </button>
        )}
      </div>

      {results ? (
        <div className="model-finder-results">
          {results.length === 0 && <div className="model-empty">Aucun modèle</div>}
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
