import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "../../../components/brand";

/**
 * A Coffre value, MASKED by default — a solid redaction bar on the ink pill,
 * revealed on demand (eye toggle) in its kind's highlight hue. The Coffre lists
 * the user's most sensitive strings; masking them here means the page can stay
 * open on a shared screen without reading as a crib sheet. View state only —
 * the value is always the REAL one, a remount re-masks.
 */
export function VaultTermPill({
  value,
  tone,
  full,
}: {
  value: string;
  /** The kind's highlight hue key (`hueForKind`), worn only when revealed. */
  tone: string;
  /** Fixed-width bar (uses-modal header) instead of the length-derived one. */
  full?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      className={`om-vault-pill${revealed ? ` revealed hl-${tone}` : ""}`}
      onClick={() => setRevealed((v) => !v)}
      aria-pressed={revealed}
      title={revealed ? "Masquer la valeur" : "Révéler la valeur"}
    >
      <span className="om-vault-pill-val">
        {revealed ? (
          value
        ) : (
          <span
            className="om-vault-pill-bar"
            aria-hidden="true"
            // Bar width tracks the value's length (runtime data) so the masked
            // pill keeps roughly the value's footprint and the row doesn't jump.
            style={{ width: full ? 128 : Math.min(150, Math.max(52, value.length * 7)) }}
          />
        )}
      </span>
      <span className="om-vault-pill-eye" aria-hidden="true">
        {revealed ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
      </span>
    </button>
  );
}
