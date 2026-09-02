import { FamilyLogo, SearchIcon, XIcon } from "../../../components/brand";
import { PriceTierSelect } from "../../../components/ModelSelector/PriceTierSelect";
import { useT } from "../../../i18n";
import { type FamilyOption, type PriceTier } from "../../../prompt/modelFilter";

/**
 * The default-model picker's toolbar: a free-text search + a row of vendor-family
 * chips (OpenAI, Anthropic, Google, Meta…) + a token-PRICE tier dropdown (Gratuit / Éco /
 * Standard / Premium — `PriceTierSelect`, shared with the chat's Finder). Pure — the tab
 * owns `query` / `family` / `price` and passes the family options. It exists so the
 * ~320-model OpenRouter catalogue is navigable instead of a wall of cards.
 */
export function ModelFilterBar({
  query,
  onQuery,
  family,
  onFamily,
  families,
  price,
  onPrice,
  showPrice = true,
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
  /** Draw the price dropdown at all — `false` when every listed model sits in ONE tier
   *  (a menu with a single useful answer is not a filter). */
  showPrice?: boolean;
  /** How many models the current query + family + price match — shown when filtering. */
  matchCount: number;
}) {
  const t = useT();
  const filtering = !!query.trim() || !!family || !!price;
  return (
    <div className="model-filter">
      <div className="model-filter-search">
        <SearchIcon size={15} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t.modelsTab.searchPlaceholder}
          className="model-filter-input"
          aria-label={t.modelsTab.searchAria}
        />
        {filtering && (
          <span className="model-filter-count">{matchCount}</span>
        )}
        {query && (
          <button
            type="button"
            className="model-filter-clear"
            title={t.modelsTab.clearSearch}
            aria-label={t.modelsTab.clearSearch}
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
            <span className="om-sweep">{t.modelsTab.all}</span>
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
      {/* Price tier — a DROPDOWN, deliberately not a second chip row under the vendor
          chips: two chip rows read as one long tag list, and four tiers are a
          rarely-touched filter. Absent when the list holds a single tier. */}
      {showPrice && <PriceTierSelect price={price} onPrice={onPrice} />}
    </div>
  );
}
