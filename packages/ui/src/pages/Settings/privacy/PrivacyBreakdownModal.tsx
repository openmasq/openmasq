import { ShieldIcon, XIcon, IconButton } from "../../../components/brand";
import { useT } from "../../../i18n";
import { ModalShell } from "../../../containers/modals";
import type { PrivacyBreakdown } from "./privacyStats";

/** The by-type breakdown modal, shared by BOTH privacy cards (your-messages and
 *  all-interceptions). `title` names which set it shows; the counts come straight
 *  from the passed `breakdown` so the modal total always equals its card. */
export function PrivacyBreakdownModal({
  title,
  breakdown,
  onClose,
}: {
  title: string;
  breakdown: PrivacyBreakdown;
  onClose: () => void;
}) {
  const t = useT();
  const { rows, total } = breakdown;
  return (
    <ModalShell onClose={onClose} width="440px" maxHeight="80vh">
      <div className="rlog-head">
        <span className="rlog-icon">
          <ShieldIcon size={18} />
        </span>
        <div className="rlog-head-text">
          <div className="rlog-title">{title}</div>
          <div className="rlog-sub">
            {t.privacyTab.protectedValues(total)}
          </div>
        </div>
        <IconButton label={t.privacyTab.revealClose} size="sm" onClick={onClose}>
          <XIcon size={18} />
        </IconButton>
      </div>
      <div className="rlog-body privacy-modal-body">
        <div className="privacy-types-list">
          {rows.map(({ key, label, bg, fg, Icon, count }) => {
            const pct = total ? Math.round((count / total) * 100) : 0;
            return (
              <div key={key} className="privacy-type-row">
                {/* per-type colour is data-driven → inline */}
                <span className="privacy-type-icon" style={{ background: bg, color: fg }}>
                  <Icon size={15} />
                </span>
                <span className="privacy-type-label">{label}</span>
                <div className="privacy-bar">
                  {/* width + fill colour are computed at runtime → inline */}
                  <div className="privacy-bar-fill" style={{ width: pct + "%", background: fg }} />
                </div>
                <span className="privacy-type-count">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}
