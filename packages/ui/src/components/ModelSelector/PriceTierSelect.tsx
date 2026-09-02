import { createPortal } from "react-dom";
import { useT } from "../../i18n";
import { usePopover } from "../../hooks/usePopover";
import { PRICE_TIERS, type PriceTier } from "../../prompt/modelFilter";
import { CheckIcon, ChevDownIcon } from "../brand";

/**
 * The token-PRICE filter of both model pickers (Réglages → Modèles and the chat's
 * Finder) as ONE dropdown: « Prix · Tous ▾ » opening the four tiers. It replaced a row
 * of five chips that sat under the vendor chips and read as a second tag list — five
 * always-visible targets for a filter most people never touch. Same vocabulary and
 * same tier keys as `filterModels` (`prompt/modelFilter`, rule 9); the words come from
 * the catalogue, never from `PRICE_TIERS`' own labels.
 *
 * Portaled + fixed (`usePopover` anchor): the Settings list scrolls and the Finder is
 * itself a fixed panel with clipped columns — an in-flow menu would be cut by either.
 * The caller hides the whole control when every listed model sits in one tier.
 */
export function PriceTierSelect({
  price,
  onPrice,
}: {
  price: PriceTier | null;
  onPrice: (tier: PriceTier | null) => void;
}) {
  const t = useT();
  const pop = usePopover<HTMLButtonElement, HTMLDivElement>({
    anchor: { gap: 4, width: 180, desiredHeight: 190, align: "left" },
  });
  const pick = (tier: PriceTier | null) => {
    onPrice(tier);
    pop.close();
  };
  return (
    <div className="model-filter-prices" role="group" aria-label={t.modelsTab.priceAria}>
      <span className="model-filter-prices-label">{t.modelsTab.price}</span>
      <button
        ref={pop.triggerRef}
        type="button"
        className={`model-price-select${price ? " on" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={pop.open}
        onClick={pop.toggle}
      >
        {price ? t.modelsTab.priceTiers[price] : t.modelsTab.all}
        <ChevDownIcon size={12} />
      </button>
      {pop.open &&
        pop.style &&
        createPortal(
          <div
            ref={pop.menuRef}
            className="model-price-pop"
            role="listbox"
            aria-label={t.modelsTab.priceAria}
            // Runtime-computed position (portal to body) — the allowed inline-style case.
            style={pop.style}
          >
            <button
              type="button"
              role="option"
              aria-selected={price === null}
              className={`model-price-opt${price === null ? " on" : ""}`}
              onClick={() => pick(null)}
            >
              {t.modelsTab.all}
              {price === null && <CheckIcon size={13} />}
            </button>
            {PRICE_TIERS.map((tier) => (
              <button
                key={tier.key}
                type="button"
                role="option"
                aria-selected={price === tier.key}
                className={`model-price-opt${price === tier.key ? " on" : ""}`}
                title={t.modelsTab.priceTierTips[tier.key]}
                onClick={() => pick(tier.key)}
              >
                {t.modelsTab.priceTiers[tier.key]}
                {price === tier.key && <CheckIcon size={13} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
