import { BRAND } from "@openmasq/branding";
import { AgentCard, GlyphTile, AgentCardTitle, AgentCardDesc } from "../../components/agent/AgentCard";
import { LockIcon, MemoryIcon } from "../../components/brand";

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
  return (
    <div className="memory-propose">
      <AgentCard
        eyebrow="Mémoire"
        tile={
          <GlyphTile>
            <MemoryIcon size={18} />
          </GlyphTile>
        }
        footer={
          <>
            <span className="agent-card-note">
              <LockIcon size={13} />
              <span>Local · chiffré · toujours redacted avant d'atteindre un modèle</span>
            </span>
            <span className="agent-card-spacer" />
            <button type="button" className="btn-ghost btn-inline" onClick={onDismiss}>
              Non merci
            </button>
            <button type="button" className="btn-primary btn-inline" onClick={onActivate}>
              Activer
            </button>
          </>
        }
      >
        <AgentCardTitle marked>{BRAND.name} peut retenir l'essentiel</AgentCardTitle>
        <AgentCardDesc>
          Cette conversation contient des faits durables. Avec la mémoire automatique, {BRAND.name}
          note seul vos clients, projets et préférences — à partir du texte déjà redacted,
          rien de nouveau ne quitte votre machine — et les rappelle dans chaque conversation
          utile. Vous pouvez aussi dire «&nbsp;retiens que…&nbsp;» à tout moment.
        </AgentCardDesc>
      </AgentCard>
    </div>
  );
}
