import { useState } from "react";
import { ShieldIcon, RefreshIcon } from "../../../components/brand";
import { DocSearchBar } from "./doc/DocSearchBar";
import type { useDocSearch } from "./doc/useDocSearch";
import type { PreviewStatus } from "./doc/docSummary";

/**
 * The preview modal's header block: eyebrow, filename, the STATUS subtitle and the
 * search / re-redact toolbar. Extracted from `AttachmentPreviewModal` (over the LOC
 * cap — new weight lands in a sibling, rule 1).
 *
 * The subtitle is the audit's three-state line (`previewStatus`): en cours (avec sa
 * progression) / échec / compte PROUVÉ — and its per-category detail opens on CLICK
 * (keyboard/touch reachable), not only behind a mouse-hover `title`.
 */
export function PreviewHeader({
  name,
  chars,
  status,
  search,
  showSearch,
  showRerun,
  redacting,
  onRerun,
}: {
  name: string;
  chars: number;
  status: PreviewStatus;
  search: ReturnType<typeof useDocSearch>;
  showSearch: boolean;
  /** True only when the file is STALE (redacted under different settings) — the bar
   *  carries the hint AND the button, so no second `stale` gate is needed inside. */
  showRerun: boolean;
  redacting?: boolean;
  onRerun?: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const line = `${chars.toLocaleString()} caractères extraits · ${status.label}`;
  return (
    <div className="rrm-head fv-head">
      <div className="cv-eyebrow rrm-eyebrow">FICHIER · APERÇU</div>
      <h2 className="cv-display rrm-title fv-title fv-title-caption">{name}</h2>
      {status.detail ? (
        <button
          type="button"
          className="rrm-sub fv-caption-sub fv-caption-btn"
          title={status.detail}
          aria-expanded={detailOpen}
          onClick={() => setDetailOpen((o) => !o)}
        >
          {line}
        </button>
      ) : (
        <p className="rrm-sub fv-caption-sub">{line}</p>
      )}
      {detailOpen && !!status.detail && (
        <p className="rrm-sub fv-caption-sub fv-caption-detail">{status.detail}</p>
      )}
      {(showSearch || showRerun) && (
        <div className="fv-toolbar-bar">
          {showSearch && <DocSearchBar search={search} />}
          {showRerun && (
            <div className="fv-reredact">
              <span className="fv-stale-hint" title="Redacted avec vos anciens réglages">
                <ShieldIcon size={12} /> Anciens réglages
              </span>
              <button className="btn-ghost btn-inline" onClick={onRerun} disabled={redacting}>
                <RefreshIcon size={13} /> {redacting ? "Reredaction…" : "Reredact"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
