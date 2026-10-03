import { hueForTone } from "@openmasq/redact";
import type { PdfReplacement } from "@openmasq/redact/pdf-redact";
import { RefreshIcon, ShieldIcon } from "../../../../components/brand";
import { useT } from "../../../../i18n";

/**
 * The notes above the preview's document: what the redacted views do NOT cover (the OFF
 * categories), a FAILED pass, and one tag per value the user chose to send in clear.
 */
export function PreviewNotes({
  inactiveCategories,
  original,
  redactError,
  redacting,
  onRerun,
  revealed,
  replacements,
  onRevealChange,
  toggleReveal,
}: {
  inactiveCategories?: string[];
  /** The Original layer is shown: nothing is redacted there by definition — no coverage note. */
  original: boolean;
  redactError?: string;
  redacting?: boolean;
  onRerun?: () => void;
  revealed: ReadonlySet<string>;
  replacements?: PdfReplacement[];
  onRevealChange?: (reveal: string[]) => void;
  toggleReveal: (real: string) => void;
}) {
  const t = useT();
  return (
    <>
      {/* Coverage disclosure — on EVERY tab, because the trap is precisely that the
          "Redacted" label + the counter read as exhaustive while the OFF categories'
          values (names, addresses…) sit in the text in clear. */}
      {!!inactiveCategories?.length && !original && (
        <div className="fv-coverage-note" role="note">
          <ShieldIcon size={12} />
          {/* Cap the list — burying « noms » under eight labels defeats the warning.
              Catalog order puts the identity categories first. */}
          <span className="flex-min">
            {t.runtime.files.notMaskedHere(inactiveCategories.slice(0, 5).join(", ").toLowerCase())}
            {inactiveCategories.length > 5 ? t.runtime.files.notMaskedMore(inactiveCategories.length - 5) : null}.
          </span>
          {/* No « Activer » shortcut: the categories live in Réglages → Confidentialité,
              which a viewer leaf must not import up into (rule 9). */}
        </div>
      )}
      {/* FAILED pass: every view says so — otherwise « Pages masquées » painted with
          nothing masked. The send is already blocked (`submit()`): display, not a leak. */}
      {!!redactError && !redacting && (
        <div className="fv-redact-fail" role="alert">
          <ShieldIcon size={12} />
          <span className="flex-min">{t.runtime.files.docMaskFailed}</span>
          {onRerun && (
            <button className="btn-ghost btn-inline" onClick={onRerun}>
              <RefreshIcon size={13} /> {t.common.retry}
            </button>
          )}
        </div>
      )}
      {onRevealChange && revealed.size > 0 && (
        /* One TAG per revealed value — the SAME bare chips row as the composer: tone by
           category, «↺» to re-redact that value. */
        <div className="detect-chips fv-reveal-chips">
          {[...revealed].map((value) => {
            // `hueForTone` guards a `tone` persisted under a retired name.
            const hue = hueForTone(replacements?.find((r) => r.real === value)?.tone ?? "amber");
            return (
              <button
                key={value}
                type="button"
                className={`detect-chip hl-${hue} kept`}
                title={t.viewers.keptClearTip}
                onClick={() => toggleReveal(value)}
              >
                <ShieldIcon size={11} />
                <span className="detect-chip-val">{value}</span>
                <span className="detect-chip-x">↺</span>
              </button>
            );
          })}
          {revealed.size > 1 && (
            <button className="btn-ghost btn-inline" onClick={() => onRevealChange([])}>
              {t.viewers.reRedactAll}
            </button>
          )}
        </div>
      )}
    </>
  );
}
