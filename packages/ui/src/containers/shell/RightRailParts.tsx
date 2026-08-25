import { useState, type ReactNode } from "react";

/**
 * The right rail's ITEM leaves (rule 1 split): one square icon tab (collapsed /
 * normal widths) and one labelled row (expanded width). Each lists ONE agent-browser
 * web tab — the rail maps its tabs onto these.
 */

/**
 * A web tab's tile: the site's real FAVICON (a raster `data:` URL fetched hardened in
 * main — never a remote URL, CSP) overlaid on the label's initial, which shows through
 * while the icon loads and if it fails. `src` changing keys a fresh load (resets the
 * error). No favicon → just the letter.
 */
export function FaviconTile({ label, src }: { label: string; src?: string }) {
  // Track WHICH src failed (not a bare boolean) so a changed favicon retries instead
  // of staying on the letter after one error.
  const [brokenSrc, setBrokenSrc] = useState<string | undefined>(undefined);
  const showImg = !!src && brokenSrc !== src;
  return (
    <span className="rail-tile rail-tile--browser rail-tile--letter">
      {(label[0] || "•").toUpperCase()}
      {showImg && (
        <img className="rail-favicon" src={src} alt="" onError={() => setBrokenSrc(src)} />
      )}
    </span>
  );
}

export function RailSquare({
  label,
  on,
  tile,
  drive,
  onSelect,
  onClose,
}: {
  label: string;
  on: boolean;
  /** The 22px tone tile (letter or glyph). */
  tile: ReactNode;
  /** Show the pink→sky drive dot (agent piloting this tab). */
  drive?: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <span className="right-rail-tab">
      <button
        type="button"
        className={`rail-btn${on ? " active" : ""}${drive ? " driving" : ""}`}
        title={on ? `Replier — ${label}` : label}
        aria-label={on ? `Replier — ${label}` : label}
        onClick={onSelect}
      >
        {tile}
        {drive && <span className="rail-drive" aria-hidden="true" title="Navigateur piloté" />}
      </button>
      <button type="button" className="right-rail-x" aria-label={`Fermer — ${label}`} onClick={onClose}>
        ×
      </button>
    </span>
  );
}

export function RailRow({
  label,
  on,
  tile,
  drive,
  onSelect,
  onClose,
}: {
  label: string;
  on: boolean;
  tile: ReactNode;
  drive?: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <button type="button" className={`rr-item${on ? " on" : ""}`} title={label} onClick={onSelect}>
      <span className={`rr-item-tile${drive ? " driving" : ""}`}>
        {tile}
        {drive && <span className="rail-drive" aria-hidden="true" />}
      </span>
      <span className="rr-item-label">{label}</span>
      <span
        className="rr-item-x"
        role="button"
        aria-label={`Fermer — ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ×
      </span>
    </button>
  );
}
