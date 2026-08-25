import { FamilyLogo, SearchIcon, XIcon } from "../../../components/brand";
import { PRICE_TIERS, type FamilyOption, type PriceTier } from "../../../prompt/modelFilter";

/**
 * The default-model picker's toolbar: a free-text search + a row of vendor-family
 * chips (OpenAI, Anthropic, Google, Meta…) + a token-PRICE tier row (Gratuit / Éco /
 * Standard / Premium). Pure — the tab owns `query` / `family` / `price` and passes
 * the family options. It exists so the ~320-model OpenRouter catalogue is navigable
 * instead of a wall of cards.
 */
export function ModelFilterBar({
  query,
  onQuery,
  family,
  onFamily,
  families,
  price,
  onPrice,
  matchCount,
}: {
  query: string;
  onQuery: (q: string) => void;
  /** Selected family key, or null for "Tous". */
  family: string | null;
  onFamily: (key: string | null) => void;
  /** Family chips to offer, most-populated first (already thresholded). */
  families: FamilyOption[];
  /** Selected price tier, or null for "Tous les prix". */
  price: PriceTier | null;
  onPrice: (tier: PriceTier | null) => void;
  /** How many models the current query + family + price match — shown when filtering. */
  matchCount: number;
}) {
  const filtering = !!query.trim() || !!family || !!price;
  return (
    <div className="model-filter">
      <div className="model-filter-search">
        <SearchIcon size={15} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Rechercher un modèle (nom, gpt, claude…)"
          className="model-filter-input"
          aria-label="Rechercher un modèle"
        />
        {filtering && (
          <span className="model-filter-count">{matchCount}</span>
        )}
        {query && (
          <button
            type="button"
            className="model-filter-clear"
            title="Effacer la recherche"
            aria-label="Effacer la recherche"
            onClick={() => onQuery("")}
          >
            <XIcon size={13} />
          </button>
        )}
      </div>
      {families.length > 0 && (
        <div className="model-filter-families">
          <button
            type="button"
            className={`model-family-chip${family === null ? " on" : ""}`}
            onClick={() => onFamily(null)}
          >
            <span className="om-sweep">Tous</span>
          </button>
          {families.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`model-family-chip${family === f.key ? " on" : ""}`}
              onClick={() => onFamily(family === f.key ? null : f.key)}
            >
              <FamilyLogo familyKey={f.key} label={f.label} size={17} />
              <span className="om-sweep">{f.label}</span>
              <span className="model-family-count">{f.count}</span>
            </button>
          ))}
        </div>
      )}
      {/* Price-tier row — deliberately a DIFFERENT chip species from the vendor chips
          above (mono micro-pills behind a « PRIX » eyebrow), so the two filter axes
          can't be misread as one list. A tier click toggles; « Tous » clears. */}
      <div className="model-filter-prices" role="group" aria-label="Filtrer par prix de token">
        <span className="model-filter-prices-label">Prix</span>
        <button
          type="button"
          className={`model-price-chip${price === null ? " on" : ""}`}
          onClick={() => onPrice(null)}
        >
          Tous
        </button>
        {PRICE_TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`model-price-chip${price === t.key ? " on" : ""}`}
            title={t.title}
            onClick={() => onPrice(price === t.key ? null : t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
