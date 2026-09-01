import { useState } from "react";
import { ShieldIcon, RefreshIcon } from "../../../components/brand";
import { DocSearchBar } from "./doc/DocSearchBar";
import type { useDocSearch } from "./doc/useDocSearch";
import type { PreviewStatus } from "./doc/docSummary";

import { useT } from "../../../i18n";
/**
 * The preview modal's header block: eyebrow, filename, the STATUS subtitle and the
 * search / re-redact toolbar. Extracted from `AttachmentPreviewModal` (over the LOC
 * cap — new weight lands in a sibling, rule 1).
 *
 * The subtitle is the audit's three-state line (`previewStatus`): in progress (with its
 * progress) / failed / PROVEN count — and its per-category detail opens on CLICK
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
  const t = useT();
  const [detailOpen, setDetailOpen] = useState(false);
  const line = t.viewers.extracted(chars.toLocaleString(t.common.intlTag), status.label);
  return (
    <div className="rrm-head fv-head">
      <div className="cv-eyebrow rrm-eyebrow">{t.viewers.eyebrow}</div>
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
              <span className="fv-stale-hint" title={t.viewers.staleTip}>
                <ShieldIcon size={12} /> {t.viewers.staleChip}
              </span>
              <button className="btn-ghost btn-inline" onClick={onRerun} disabled={redacting}>
                <RefreshIcon size={13} /> {redacting ? t.viewers.rerunning : t.viewers.rerun}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
