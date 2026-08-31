import { useMemo, useState } from "react";
import { useT } from "../../../i18n";
import { AnimatePresence } from "framer-motion";
import { ShieldIcon, ChevDownIcon } from "../../../components/brand";
import { PrivacyBreakdownModal } from "./PrivacyBreakdownModal";
import { messageBreakdown, vaultBreakdown, type PrivacyBreakdown } from "./privacyStats";
import type { Conversation } from "../../../types";
import { BRAND } from "@openmasq/branding";

type Which = "messages" | "all";

/** "Your privacy" report — TWO distinct stat cards, each opening its own by-type
 *  modal, both from REAL persisted conversation data:
 *   • "messages"  = the sensitive values YOU typed into messages (excludes tool
 *     results & documents) — what the user entered as sensitive variables.
 *   • "all"       = ALL interceptions ever vaulted (messages + MCP tool results +
 *     document/file redaction + exports). The detailed per-item log lives in the
 *     Audit tab. Each card's big number equals its modal's total by construction. */
export function PrivacyReport({
  conversations,
  onOpenAudit,
}: {
  conversations: Conversation[];
  /** Open the detailed journal. Absent ⇒ the link is not offered. */
  onOpenAudit?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState<Which | null>(null);

  const messages = useMemo(() => messageBreakdown(conversations), [conversations]);
  const all = useMemo(() => vaultBreakdown(conversations), [conversations]);

  // NOTHING protected yet is the FIRST thing a new account sees. Two big « 0 » read as a
  // broken feature; a sentence says the same and reads as a beginning.
  if (all.total === 0 && messages.total === 0) {
    return (
      <section className="settings-section">
        <div className="cv-eyebrow">{t.privacyTab.reportEyebrow}</div>
        <div className="settings-card privacy-empty">
          <ShieldIcon size={18} />
          <p>
            {t.privacyTab.reportEmpty(BRAND.name)}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <div className="cv-eyebrow">{t.privacyTab.reportEyebrow}</div>
      <div className="privacy-stats">
        <PrivacyStatCard
          breakdown={messages}
          sub={(n) => t.privacyTab.reportMessagesSub(n)}
          onOpen={() => setOpen("messages")}
        />
        <PrivacyStatCard
          breakdown={all}
          sub={() => t.privacyTab.reportAllSub}
          onOpen={() => setOpen("all")}
        />
      </div>
      {onOpenAudit && (
        <button type="button" className="privacy-audit-link" onClick={onOpenAudit}>
          {t.privacyTab.reportDetail}
          <span className="chev-rot-90">
            <ChevDownIcon size={15} />
          </span>
        </button>
      )}

      <AnimatePresence>
        {open === "messages" && (
          <PrivacyBreakdownModal
            title={t.privacyTab.reportMessagesTitle}
            breakdown={messages}
            onClose={() => setOpen(null)}
          />
        )}
        {open === "all" && (
          <PrivacyBreakdownModal
            title={t.privacyTab.reportAllTitle}
            breakdown={all}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

/** One clickable stat card: a shield, the big total, a caption, and (when there's a
 *  breakdown) a "Par type →" affordance. Disabled with no data. */
function PrivacyStatCard({
  breakdown,
  sub,
  onOpen,
}: {
  breakdown: PrivacyBreakdown;
  sub: (chats: number) => string;
  onOpen: () => void;
}) {
  const t = useT();
  const has = breakdown.rows.length > 0;
  return (
    <button
      type="button"
      className="settings-card privacy-card-stat privacy-card-btn"
      onClick={() => has && onOpen()}
      disabled={!has}
      aria-haspopup="dialog"
      title={has ? t.privacyTab.reportByTypeTip : undefined}
    >
      <span className="privacy-shield">
        <ShieldIcon size={26} />
      </span>
      <div className="privacy-stat-textcol">
        <div className="privacy-stat-num">{breakdown.total.toLocaleString()}</div>
        <div className="privacy-stat-sub">{sub(breakdown.chats)}</div>
      </div>
      {has && (
        <span className="privacy-card-cta">
          {t.privacyTab.reportByType}
          <span className="chev-rot-90">
            <ChevDownIcon size={16} />
          </span>
        </span>
      )}
    </button>
  );
}
