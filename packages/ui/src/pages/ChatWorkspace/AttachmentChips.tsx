import type { CSSProperties } from "react";
import { useT } from "../../i18n";
import { AlertIcon, FileIcon, RefreshIcon, ShieldIcon, XIcon } from "../../components/brand";
import type { Attachment } from "./Composer";
import { ocrShortfall } from "./ocrShortfall";

/**
 * The composer's ATTACHMENT chip row (kit ComposerFileThumb) — peeled off
 * `Composer.tsx` (LOC ratchet). Pure render over the attachment lifecycle the
 * caller owns: extraction → redaction (with progress) → error / stale-engine
 * re-run / preview open / remove.
 *
 * The chip says ONE of four states (lecture · masquage · à refaire · prêt) and offers
 * ONE contextual action besides the remove cross; the reason and the detail live in
 * the tooltip. Eight ad-hoc labels used to compete for the same 10-px line.
 */
export function AttachmentChips({
  attachments,
  currentRedactSig,
  onRetry,
  onOcrAll,
  onRemove,
  onOpen,
}: {
  attachments: Attachment[];
  /** Current redaction engine signature — a chip redacted with another shows « remasquer ». */
  currentRedactSig?: string;
  onRetry?: (cid: string) => void;
  /** « Lire tout » — re-read a PDF whose OCR stopped at the cap (`ocrShortfall`). */
  onOcrAll?: (cid: string) => void;
  onRemove: (index: number) => void;
  onOpen: (cid: string) => void;
}) {
  const t = useT();
  return (
    <div className="attach-chips">
      {attachments.map((a, i) => {
        // The file was redacted with a DIFFERENT engine than the one now
        // selected (the user switched redaction model/engine since attaching).
        const engineChanged =
          !!a.redactEngineSig && !!currentRedactSig && a.redactEngineSig !== currentRedactSig;
        const showRerun = !a.redacting && !!onRetry && (!!a.redactError || engineChanged);
        // OCR stopped at the cap: the chip ALWAYS says so; the « Lire tout »
        // gesture only appears if the host knows how to re-read (extractAll) and the
        // file has a path (a dropped one with no path keeps the marker in its text).
        const shortfall = !a.redacting && ocrShortfall(a);
        const showOcrAll = !!shortfall && !!onOcrAll && !!a.path;
        // The four states, in the order the file goes through them. « À refaire »
        // covers everything that needs a gesture (an error, a partial read, stale rules).
        const redo = !!a.error || !!a.redactError || !!shortfall || engineChanged;
        const state = a.extracting ? "reading" : a.redacting ? "masking" : redo ? "redo" : "ready";
        const pct = (p?: { done: number; total: number }) =>
          p && p.total > 1 ? Math.round((p.done / p.total) * 100) : undefined;
        const stateLabel =
          state === "reading"
            ? a.extractProgress && a.extractProgress.total > 1
              ? // Paginated OCR: stating the current page beats a percentage
                // (the user sees their document, they think in pages).
                t.composer.attachments.stateReadingPage(
                  Math.min(a.extractProgress.done + 1, a.extractProgress.total),
                  a.extractProgress.total,
                )
              : t.composer.attachments.stateReading
            : state === "masking"
              ? pct(a.redactProgress) !== undefined
                ? t.composer.attachments.stateMaskingPct(pct(a.redactProgress)!)
                : t.composer.attachments.stateMasking
              : state === "redo"
                ? t.composer.attachments.stateRedo
                : a.redactPreview > 0
                  ? // The unit matters on a chip this small: « 10 » alone read as a
                    // file count / a page number as often as a redaction count.
                    t.composer.attachments.stateReady(a.redactPreview)
                  : a.kind;
        // The tooltip carries the REASON: the error text, the stale rules, the pages left.
        const tip = a.error
          ? a.error
          : a.redactError
            ? a.redactError
            : a.redacting
              ? t.composer.attachments.redacting
              : shortfall
                ? t.composer.attachments.partialTip(shortfall.read, shortfall.total)
                : engineChanged
                  ? t.composer.attachments.staleTip
                  : t.composer.attachments.open;
        // An image stays viewable even when text OCR failed (the picture itself is
        // fine) — so don't let its `error` block the preview. Its bytes may come from
        // a granted PATH or be held in memory (a drop / a Bibliothèque re-attach has
        // only the latter): asking for `path` alone made a dropped image's chip inert,
        // with nothing to click and nothing said.
        const openable =
          !a.redacting && !a.extracting && (a.kind === "image" ? !!a.path || !!a.data : !a.error);
        const open = () => openable && onOpen(a.cid);
        return (
          // ⚠️ A clickable `span` is INVISIBLE to the keyboard and screen reader: the
          // only door to the preview — hence to checking what will be masked
          // before sending — only opened with the mouse (finding, 15/08). Not a real
          // <button>: the chip CONTAINS buttons (re-read, re-redact, remove), and
          // nesting them is invalid. Hence the role/tabIndex/keyboard trio, done by hand.
          <span
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`${a.name} — ${openable ? t.composer.attachments.open : t.composer.attachments.processing}`}
            aria-disabled={!openable || undefined}
            className={`attach-chip ${a.error || a.redactError ? "err" : engineChanged ? "stale" : ""}`}
            title={tip}
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault(); // space must not scroll the page
                open();
              }
            }}
          >
            {/* Tone TILE + two-line body; the redaction progress veils the tile
                (CSS clip via --attach-progress); `loading` pulses while the file is
                being extracted or analysed. */}
            <span
              className={`attach-tile${a.kind === "image" ? " image" : ""}${a.redacting ? " redacting" : ""}${a.extracting || a.redacting ? " loading" : ""}`}
              aria-hidden="true"
              style={
                a.redacting && a.redactProgress && a.redactProgress.total > 0
                  ? ({ "--attach-progress": `${Math.round((a.redactProgress.done / a.redactProgress.total) * 100)}%` } as CSSProperties)
                  : undefined
              }
            >
              <FileIcon size={17} />
            </span>
            <span className="attach-body">
              <span className="attach-name">{a.name}</span>
              <span className="attach-meta">
                {/* One glyph per state (Lucide, like the rest of the app), one word. */}
                {state === "reading" ? (
                  <FileIcon size={11} />
                ) : state === "masking" ? (
                  <RefreshIcon size={11} />
                ) : state === "redo" ? (
                  <AlertIcon size={11} />
                ) : a.redactPreview > 0 ? (
                  <ShieldIcon size={11} />
                ) : null}
                <span>{stateLabel}</span>
              </span>
            </span>
            {/* ONE contextual action: re-read the pages the OCR left, else re-mask /
                retry. Both buttons used to be able to show at once. */}
            {showOcrAll ? (
              <button
                className="attach-retry"
                aria-label={t.composer.attachments.readAllPages(shortfall!.total)}
                title={t.composer.attachments.readAllPagesTip(shortfall!.read)}
                onClick={(e) => {
                  e.stopPropagation();
                  onOcrAll!(a.cid);
                }}
              >
                <RefreshIcon size={13} />
              </button>
            ) : showRerun ? (
              <button
                className="attach-retry"
                aria-label={a.redactError ? t.composer.attachments.retryRedaction : t.composer.attachments.reRedact}
                title={
                  a.redactError
                    ? t.composer.attachments.retryRedaction
                    : t.composer.attachments.reRedactTip
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry!(a.cid);
                }}
              >
                <RefreshIcon size={11} />
              </button>
            ) : null}
            <button
              className="attach-x"
              aria-label={t.composer.attachments.remove}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(i);
              }}
            >
              <XIcon size={11} />
            </button>
            {a.redacting && a.redactProgress && a.redactProgress.total > 1 && (
              <span className="attach-progress" aria-hidden="true">
                <span
                  className="attach-progress-fill"
                  // Dynamic width from data → the allowed inline-style exception.
                  style={{
                    width: `${Math.round((a.redactProgress.done / a.redactProgress.total) * 100)}%`,
                  }}
                />
              </span>
            )}
            {/* Extraction: DETERMINATE when the OCR reports its per-page progress
                (`files:ocr-progress` → extractProgress), INDETERMINATE otherwise (a
                format with no measurable steps, or a host that doesn't relay). */}
            {a.extracting && (
              <span className="attach-progress" aria-hidden="true">
                {a.extractProgress && a.extractProgress.total > 0 ? (
                  <span
                    className="attach-progress-fill"
                    // Dynamic width from data → the allowed inline-style exception.
                    style={{
                      width: `${Math.round((a.extractProgress.done / a.extractProgress.total) * 100)}%`,
                    }}
                  />
                ) : (
                  <span className="attach-progress-indet" />
                )}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
