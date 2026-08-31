import { useRef, useState, type MouseEvent } from "react";
import { useT } from "../../i18n";
import { ModalShell, ModalTitle } from "../../containers/modals";
import { Markdown } from "../../components/markdown/Markdown";
import { ShieldIcon } from "../../components/brand";
import { HighlightedTextarea, type HlSeg } from "./HighlightedTextarea";
import { MarkKeepMenu } from "./MarkKeepMenu";
import { SelectionMenu } from "../../components/SelectionMenu";
import { useTextareaSelection } from "./useTextareaSelection";
import { markAtCaret, MIRROR_MAX_CHARS, type Detected, type Item } from "./composerDetection";
import { DetectChips } from "./ComposerChips";

/**
 * The LONG-TEXT editor — a paste past `LONG_TEXT_THRESHOLD` collapses the inline
 * chatbox to a summary card, and the editing moves here: a full-height editor with
 * the SAME live redaction mirror (same segments, computed by the Composer — one
 * detection, two views), the same gestures (click a mark → keep in clear; select →
 * force-redact), plus an APERÇU tab rendering the draft as Markdown — the exact
 * renderer the sent message will use, so what you preview is what the thread shows.
 *
 * Editing only — the SEND stays in the composer (its button carries the redaction
 * spinner/check and the gates). Enter inserts a newline here, never sends: this is
 * a document surface.
 */
export function ComposerTextModal({
  input,
  onInput,
  segments,
  mirrorOff,
  items,
  ranges,
  keepSet,
  onToggleKeep,
  keepValueOf,
  liveCount,
  onForceRedact,
  onAddToCoffre,
  onClose,
}: {
  input: string;
  onInput: (v: string) => void;
  segments: HlSeg[];
  /** True past MIRROR_MAX_CHARS: the mirror is a plain segment (fast typing) — the
   *  notice explains that detection and the send-time guarantee are unchanged. */
  mirrorOff?: boolean;
  /** The detected values — the chips row rendered under the editor, so a long text's
   *  many detections are manageable from HERE too (collapsed past one row). */
  items: Item[];
  ranges: Detected[];
  keepSet: Set<string>;
  onToggleKeep: (value: string) => void;
  /** Resolve a clicked OCCURRENCE to its chip-level value (entity casing variants). */
  keepValueOf: (occurrence: string) => string;
  liveCount: number;
  onForceRedact?: (text: string, token: string) => void;
  onAddToCoffre?: (text: string, token: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [markMenu, setMarkMenu] = useState<{ x: number; y: number; value: string; hue: string } | null>(null);
  const { sel, onSelect, clear } = useTextareaSelection(taRef);

  const onMouseUp = (e: MouseEvent) => {
    if (onForceRedact) onSelect(e);
    const { clientX, clientY } = e;
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta || ta.selectionStart !== ta.selectionEnd) return;
      const m = markAtCaret(ranges, keepSet, ta.selectionStart ?? -1);
      setMarkMenu(m ? { x: clientX, y: clientY, value: m.value, hue: m.hue } : null);
    });
  };

  return (
    <ModalShell onClose={onClose} width="min(880px, 94vw)" maxHeight="86vh">
      <div className="composer-modal">
        <ModalTitle>{t.composer.modal.title}</ModalTitle>
        <p className="composer-modal-sub">{t.composer.modal.sub}</p>
        <div className="composer-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "edit"}
            className={`composer-modal-tab${tab === "edit" ? " on" : ""}`}
            onClick={() => setTab("edit")}
          >
            {t.composer.modal.tabEdit}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "preview"}
            className={`composer-modal-tab${tab === "preview" ? " on" : ""}`}
            onClick={() => setTab("preview")}
          >
            {t.composer.modal.tabPreview}
          </button>
          {liveCount > 0 && (
            <span className="protected-pill sm">
              <ShieldIcon size={12} />
              {t.composer.modal.toMask(liveCount)}
            </span>
          )}
        </div>
        {mirrorOff && tab === "edit" && (
          <p className="composer-modal-note">{t.composer.modal.mirrorOff(MIRROR_MAX_CHARS)}</p>
        )}
        {tab === "edit" ? (
          <div className="composer-modal-editor">
            <HighlightedTextarea
              taRef={taRef}
              backdropRef={backdropRef}
              value={input}
              onChange={onInput}
              segments={segments}
              grow={null}
              onMouseUp={onMouseUp}
              onKeyUp={onForceRedact ? (e) => (e.shiftKey ? onSelect() : undefined) : undefined}
            />
          </div>
        ) : (
          <div className="composer-modal-preview">
            <Markdown content={input} />
          </div>
        )}
        {items.length > 0 && (
          <DetectChips items={items} keepSet={keepSet} onToggle={onToggleKeep} />
        )}
        <div className="composer-modal-foot">
          <button type="button" className="btn-primary" onClick={onClose}>
            {t.composer.modal.done}
          </button>
        </div>
        {markMenu && (
          <MarkKeepMenu
            {...markMenu}
            onKeep={() => onToggleKeep(keepValueOf(markMenu.value))}
            onClose={() => setMarkMenu(null)}
          />
        )}
        {sel && onForceRedact && (
          <SelectionMenu
            x={sel.x}
            y={sel.y}
            onPick={(token) => {
              onForceRedact(sel.text, token);
              clear();
            }}
            onCoffre={
              onAddToCoffre
                ? (token) => {
                    onAddToCoffre(sel.text, token);
                    clear();
                  }
                : undefined
            }
          />
        )}
      </div>
    </ModalShell>
  );
}
