import { BRAND } from "@openmasq/branding";
import { AgentCard, GlyphTile, AgentCardTitle, AgentCardDesc } from "../../components/agent/AgentCard";
import { LockIcon, MemoryIcon } from "../../components/brand";
import { useT } from "../../i18n";

/**
 * The one-time in-chat « activer la mémoire automatique ? » proposal — the same
 * pattern as the browser-activation suggestion: offer the feature AT the moment it
 * would have helped (a settled conversation carrying durable facts), under the reply,
 * never a modal. `AgentCard` family so it reads as an in-chat container. Both answers
 * persist `memoryProposalSeen` — it offers itself once, ever; the switch stays on the
 * Mémoire page. Copy makes the privacy claim, so it must track reality (root rule 8):
 * the extraction reads the already-redacted wire — zero new egress.
 */
export function MemoryProposalCard({
  onActivate,
  onDismiss,
}: {
  onActivate: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <div className="memory-propose">
      <AgentCard
        eyebrow={t.cards.memoryProposal.eyebrow}
        tile={
          <GlyphTile>
            <MemoryIcon size={18} />
          </GlyphTile>
        }
        footer={
          <>
            <span className="agent-card-note">
              <LockIcon size={13} />
              <span>{t.cards.memoryProposal.note}</span>
            </span>
            <span className="agent-card-spacer" />
            <button type="button" className="btn-ghost btn-inline" onClick={onDismiss}>
              {t.cards.memoryProposal.decline}
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={onActivate}>
              {t.cards.memoryProposal.activate}
            </button>
          </>
        }
      >
        <AgentCardTitle marked>{t.cards.memoryProposal.title(BRAND.name)}</AgentCardTitle>
        <AgentCardDesc>{t.cards.memoryProposal.desc(BRAND.name)}</AgentCardDesc>
      </AgentCard>
    </div>
  );
}
