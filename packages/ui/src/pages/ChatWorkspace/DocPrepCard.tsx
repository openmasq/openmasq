import { BrandLoader } from "../../components/media/BrandLogo";
import { useT } from "../../i18n";

/**
 * The progress bar for a document's redaction AT SEND TIME — rendering a
 * redacted PDF's pages as images takes seconds, and without it the send looked
 * stuck. The gesture it carries is « Annuler »: the wait must always have a
 * way out.
 *
 * It lives beside `ChatView` rather than inside it (rule 1): the page shouldn't
 * carry a progress card on top of everything else.
 */
export interface DocPrepState {
  /** `detect` = analysis (indeterminate); `render` = page-by-page rendering (measurable). */
  phase: "detect" | "render";
  name: string;
  page: number;
  total: number;
  /** The document's rank in a batch, when there are several. */
  idx: number;
  count: number;
}

export function DocPrepCard({ state, onCancel }: { state: DocPrepState; onCancel: () => void }) {
  const t = useT();
  const { phase, name, page, total, idx, count } = state;
  return (
    <div className="docprep" role="status" aria-live="polite">
      <BrandLoader size={30} mono />
      <div className="docprep-info flex-min">
        <div className="docprep-title">
          {phase === "detect" ? t.conversation.docPrep.analysing : t.conversation.docPrep.redacting}
          {count > 1 && t.conversation.docPrep.ofCount(idx, count)}
        </div>
        <div className="docprep-note">
          {name}
          {total > 0 &&
            (phase === "render"
              ? t.conversation.docPrep.page(page, total)
              : t.conversation.docPrep.pages(total))}
        </div>
        {total > 0 && (
          <div className="docprep-bar">
            <div
              className={`docprep-bar-fill${phase === "detect" ? " indet" : ""}`}
              // Width COMPUTED at runtime — the case where inline is the right answer.
              style={phase === "render" ? { width: `${Math.round((page / total) * 100)}%` } : undefined}
            />
          </div>
        )}
      </div>
      <button type="button" className="docprep-cancel" onClick={onCancel}>
        {t.common.cancel}
      </button>
    </div>
  );
}
