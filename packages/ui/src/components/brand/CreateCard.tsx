import { PlusIcon } from "./icons";

/**
 * The kit's dashed "create" tile — first cell of a card grid, same footprint as
 * the cards it precedes. Promoted from `pages/Competences/parts/` the day the
 * Workflows grid became its second caller (promotion-by-reuse).
 */
export function CreateCard({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="om-create-card" onClick={onClick}>
      <span className="om-create-card-plus">
        <PlusIcon size={18} />
      </span>
      <span className="om-create-card-label">{label}</span>
      {hint && <span className="om-create-card-hint">{hint}</span>}
    </button>
  );
}
