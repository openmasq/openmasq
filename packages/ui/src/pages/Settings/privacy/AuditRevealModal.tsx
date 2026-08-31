import { useState } from "react";
import { useT } from "../../../i18n";
import { EyeIcon, XIcon, CopyIcon, IconButton } from "../../../components/brand";
import { ModalShell } from "../../../containers/modals";

/** Reveal ONE audit entry's real value on explicit click — the value is masked to
 *  `•••` in the table (shoulder-surfing / default-privacy), shown here in clear only
 *  when the user asks. Local data, never transmitted; this just controls what's on
 *  screen. Fields are passed flat (not the `AuditRow` type) to avoid a circular import
 *  with `AuditLogTab`. */
export function AuditRevealModal({
  typeLabel,
  typeFg,
  typeBg,
  original,
  fake,
  convTitle,
  at,
  onClose,
}: {
  typeLabel: string;
  typeFg?: string;
  typeBg?: string;
  original: string;
  fake: string;
  convTitle: string;
  at: number;
  onClose: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(original).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <ModalShell onClose={onClose} width="460px" maxHeight="80vh">
      <div className="rlog-head">
        <span className="rlog-icon">
          <EyeIcon size={18} />
        </span>
        <div className="rlog-head-text">
          <div className="rlog-title">{t.privacyTab.revealTitle}</div>
          <div className="rlog-sub">
            {/* per-type colour is data-driven → inline */}
            <span className="audit-reveal-tag" style={{ background: typeBg, color: typeFg }}>
              {typeLabel}
            </span>
          </div>
        </div>
        <IconButton label={t.privacyTab.revealClose} size="sm" onClick={onClose}>
          <XIcon size={18} />
        </IconButton>
      </div>
      <div className="rlog-body">
        {/* The real value, revealed — monospace, selectable, with a copy affordance. */}
        <div className="audit-reveal-value">
          <span className="audit-reveal-real">{original}</span>
          <button type="button" className="audit-reveal-copy" onClick={copy} title={t.privacyTab.revealCopy}>
            <CopyIcon size={14} /> {copied ? t.privacyTab.revealCopied : t.privacyTab.revealCopy}
          </button>
        </div>
        <dl className="audit-reveal-meta">
          <div>
            <dt>{t.privacyTab.revealReplacedBy}</dt>
            <dd className="audit-reveal-fake">{fake}</dd>
          </div>
          <div>
            <dt>{t.privacyTab.revealConversation}</dt>
            <dd>{convTitle}</dd>
          </div>
          <div>
            <dt>{t.privacyTab.revealWhen}</dt>
            <dd>{new Date(at).toLocaleString(t.common.intlTag)}</dd>
          </div>
        </dl>
        <p className="audit-reveal-note">
          {t.privacyTab.revealNote}
        </p>
      </div>
    </ModalShell>
  );
}
