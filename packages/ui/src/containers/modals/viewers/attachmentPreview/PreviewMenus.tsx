import { occursFlexibly, type PdfReplacement } from "@openmasq/redact/pdf-redact";
import { SelectionMenu } from "../../../../components/SelectionMenu";
import { useT } from "../../../../i18n";
import { realFromRedactedSelection } from "../doc/docForce";
import type { WordPick } from "./useWordPick";

/**
 * The manual « Masquer » menus of the preview — the SAME data-type picker as the composer:
 * over a clicked canvas WORD (PDF page, scan), and over a text SELECTION. On the redacted
 * view a selection may be a FAKE: the REAL value it stands for is what gets forced.
 */
export function PreviewMenus({
  text,
  view,
  wordPick,
  closeWordPick,
  sel,
  clearSel,
  canForce,
  displayReplacements,
  onForceRedact,
  onAddToVault,
}: {
  text: string;
  view: string;
  wordPick: WordPick | null;
  closeWordPick: () => void;
  sel: { x: number; y: number; text: string } | null;
  clearSel: () => void;
  canForce: boolean;
  displayReplacements?: PdfReplacement[];
  onForceRedact?: (value: string, token: string) => void;
  onAddToVault?: (value: string, token: string) => void;
}) {
  const t = useT();
  const selValue = (s: string) => (view === "redacted" ? realFromRedactedSelection(s, displayReplacements) : s);
  const endSel = () => {
    clearSel();
    window.getSelection()?.removeAllRanges();
  };
  return (
    <>
      {/* Click-a-word picker (canvas views): opens DIRECTLY on the type grid, titled with
          the clicked word. The canvas shows the ORIGINAL glyphs outside the marks (marks
          are guarded off), so the clicked word IS the real value. */}
      {wordPick && onForceRedact && (
        <SelectionMenu
          x={wordPick.x}
          y={wordPick.y}
          onClose={closeWordPick} /* Escape — the outside click lives in `useWordPick` */
          origin="document" /* telemetry distinguishes the attachment from a chat selection */
          expanded
          label={t.runtime.files.maskSelection(
            wordPick.value.length > 42 ? `${wordPick.value.slice(0, 40)}…` : wordPick.value,
          )}
          note={
            // A run absent from the PRIMARY text is image-baked (logo, stamp): NOT part of
            // the text sent to the model. Inform, don't forbid.
            occursFlexibly(text, wordPick.value) ? undefined : t.runtime.files.imageOnlyZone
          }
          onPick={(token) => {
            onForceRedact(wordPick.value, token);
            closeWordPick();
          }}
          onVault={
            onAddToVault
              ? (token) => {
                  onAddToVault(wordPick.value, token);
                  onForceRedact(wordPick.value, token);
                  closeWordPick();
                }
              : undefined
          }
        />
      )}
      {canForce && sel && onForceRedact && (
        <SelectionMenu
          x={sel.x}
          y={sel.y}
          onPick={(token) => {
            onForceRedact(selValue(sel.text), token);
            endSel();
          }}
          onVault={
            onAddToVault
              ? (token) => {
                  const value = selValue(sel.text);
                  // Global protection + still force it in THIS document so the preview
                  // shows it faked immediately (Coffre = superset of "this conversation").
                  onAddToVault(value, token);
                  onForceRedact(value, token);
                  endSel();
                }
              : undefined
          }
        />
      )}
    </>
  );
}
