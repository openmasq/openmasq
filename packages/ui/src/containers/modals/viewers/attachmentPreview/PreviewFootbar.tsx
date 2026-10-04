import { ShieldIcon } from "../../../../components/brand";
import { useT } from "../../../../i18n";

/**
 * Discoverability of the manual « Masquer », as a slim BOTTOM bar so it never eats the
 * document's height: select-to-redact on the selectable text views; on the canvas/grid views
 * (no selection possible) a pointer to the « Masqué » text view to hand-redact a miss.
 */
export function PreviewFootbar({
  canForce,
  canvasHint,
  onShowRedacted,
}: {
  canForce: boolean;
  canvasHint: boolean;
  onShowRedacted: () => void;
}) {
  const t = useT();
  if (canForce)
    return (
      <div className="fv-footbar" role="note">
        <ShieldIcon size={12} /> {t.viewers.selectToRedact}
      </div>
    );
  if (!canvasHint) return null;
  return (
    <div className="fv-footbar" role="note">
      <ShieldIcon size={12} />
      <span>
        {t.viewers.missedValueLead}
        <button type="button" className="fv-hint-link" onClick={onShowRedacted}>
          {t.docViews.redacted}
        </button>
        {t.viewers.missedValueTail}
      </span>
    </div>
  );
}
