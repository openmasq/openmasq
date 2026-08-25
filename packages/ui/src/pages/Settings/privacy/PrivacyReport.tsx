import { useMemo, useState } from "react";
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
  const [open, setOpen] = useState<Which | null>(null);

  const messages = useMemo(() => messageBreakdown(conversations), [conversations]);
  const all = useMemo(() => vaultBreakdown(conversations), [conversations]);

  // NOTHING protected yet is the FIRST thing a new account sees. Two big « 0 » read as a
  // broken feature; a sentence says the same and reads as a beginning.
  if (all.total === 0 && messages.total === 0) {
    return (
      <section className="settings-section">
        <div className="cv-eyebrow">Ce qui a été protégé</div>
        <div className="settings-card privacy-empty">
          <ShieldIcon size={18} />
          <p>
            Rien n'est encore parti d'ici. Dès votre premier message, vous verrez ici ce que
            {BRAND.name} a protégé — et de quel type.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <div className="cv-eyebrow">Ce qui a été protégé</div>
      <div className="privacy-stats">
        <PrivacyStatCard
          breakdown={messages}
          sub={(n) => `saisies dans vos messages · ${n} conversation${n === 1 ? "" : "s"}`}
          onOpen={() => setOpen("messages")}
        />
        <PrivacyStatCard
          breakdown={all}
          sub={() => "tout ce qui a été redacted · messages, outils et documents"}
          onOpen={() => setOpen("all")}
        />
      </div>
      {onOpenAudit && (
        <button type="button" className="privacy-audit-link" onClick={onOpenAudit}>
          Voir le journal détaillé
          <span className="chev-rot-90">
            <ChevDownIcon size={15} />
          </span>
        </button>
      )}

      <AnimatePresence>
        {open === "messages" && (
          <PrivacyBreakdownModal
            title="Vos messages · par type"
            breakdown={messages}
            onClose={() => setOpen(null)}
          />
        )}
        {open === "all" && (
          <PrivacyBreakdownModal
            title="Tout ce qui a été redacted · par type"
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
  const has = breakdown.rows.length > 0;
  return (
    <button
      type="button"
      className="settings-card privacy-card-stat privacy-card-btn"
      onClick={() => has && onOpen()}
      disabled={!has}
      aria-haspopup="dialog"
      title={has ? "Voir la répartition par type" : undefined}
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
          Par type
          <span className="chev-rot-90">
            <ChevDownIcon size={16} />
          </span>
        </span>
      )}
    </button>
  );
}
