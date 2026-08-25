import { MarkTile, familyMark } from "./marks";

/**
 * The vendor mark for a model FAMILY (the default-model picker's family chips).
 * A known vendor shows its real mark on a tile — the SAME marks the model cards
 * use (hand-inlined `Glyph`, or an authentic `simple-icons` brand); an unknown
 * vendor (Poolside, Sao10k…) shows a neutral letter monogram, so every chip still
 * carries a mark. Keyed by the CANONICAL family key from `vendorKey.ts`.
 */
export function FamilyLogo({
  familyKey,
  label,
  size = 18,
}: {
  familyKey: string;
  label: string;
  size?: number;
}) {
  const mark = familyMark(familyKey);
  if (!mark) {
    return (
      <span className="model-family-mono" style={{ width: size, height: size }} aria-hidden="true">
        {label.charAt(0).toUpperCase()}
      </span>
    );
  }
  return <MarkTile mark={mark} size={size} />;
}
