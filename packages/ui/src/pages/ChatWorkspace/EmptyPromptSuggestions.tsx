import { EditIcon, FileIcon, UsersIcon, MemoryIcon, XIcon } from "../../components/brand";
import { McpTile } from "../../components/media/McpTile";
import { findConnector } from "@openmasq/catalog/mcp";
import { useMcpConnectedIds } from "../../hooks/useMcpConnectedIds";
import { connectorCopy } from "../../help/catalogCopy";
import { pickStarters, starterCopy, type PickedStarter } from "./starters";
import { useFeatureAccess } from "../../state/billing/featureAccess";
import type { ReactNode } from "react";

import { useT } from "../../i18n";
/**
 * The empty-thread prompt starters: the universal row, and — only for services that ARE
 * connected — a row about the user's own data. Never an offer to connect (`starters.ts`
 * says why): every card sends a prompt that works as it stands.
 *
 * The tiles of universal cards are NEUTRAL (monochrome) on purpose — the highlight hues
 * are the REDACTION's colour language, and wearing them on ordinary category badges
 * diluted that meaning. An INTEGRATION card wears the service's real mark: it is the
 * card's whole claim ("this is about YOUR OneDrive").
 */

/** The glyph a universal starter wears, by id. */
const UNIVERSAL_ICON: Record<string, ReactNode> = {
  "follow-up": <EditIcon size={16} />,
  "contract-review": <FileIcon size={16} />,
  "hr-review": <UsersIcon size={16} />,
  memory: <MemoryIcon size={16} />,
};

function StarterCard({ starter, onPick }: { starter: PickedStarter; onPick: (prompt: string) => void }) {
  const t = useT();
  const connector = starter.connectorId ? findConnector(starter.connectorId) : undefined;
  const name = connector ? connectorCopy(connector.id, connector, t).name : undefined;
  const { cat, prompt } = starterCopy(starter, t, name);
  return (
    <button
      type="button"
      className="om-starter"
      // The WHOLE prompt is here: the card only shows one line of it (the height is
      // the welcome screen itself), the branded tooltip renders the rest on hover —
      // preceded by the category, which is no longer written on the card.
      title={t.conversation.starters.cardTip(name ?? cat, prompt)}
      aria-label={t.conversation.starters.cardAria(name ?? cat, prompt)}
      onClick={() => onPick(prompt)}
    >
      {/* ONE line, and the CATEGORY is not written there: stacked, the card was 78px and
          the welcome screen overflowed at the bottom. So the glyph (or the service's logo)
          carries it, and the word stays in the tooltip and the accessible name. */}
      {connector ? (
        <McpTile id={connector.id} name={name ?? connector.name} tone={connector.tone ?? "mint"} sm />
      ) : (
        <span className="om-starter-tile">{UNIVERSAL_ICON[starter.id]}</span>
      )}
      <span className="om-starter-prompt">{prompt}</span>
    </button>
  );
}

export function EmptyPromptSuggestions({
  onPick,
  onDismiss,
}: {
  onPick: (prompt: string) => void;
  /** « Ne plus proposer » — absent ⇒ the cards cannot be dismissed. */
  onDismiss?: () => void;
}) {
  const t = useT();
  const access = useFeatureAccess();
  // Live: connecting a service in Réglages adds its card on the way back, with no reload.
  // Absent host.mcp (web preview) ⇒ nothing connected ⇒ the universal row alone.
  const { universal, integrations } = pickStarters(useMcpConnectedIds(), { memoryOpen: access.memory });
  const row = (list: PickedStarter[]) => (
    <div className="om-starters">
      {list.map((s) => (
        <StarterCard key={s.id} starter={s} onPick={onPick} />
      ))}
    </div>
  );
  return (
    <div className="om-starters-wrap">
      {row(universal)}
      {integrations.length > 0 && (
        <>
          <div className="cv-eyebrow om-starters-title">{t.conversation.starters.withServices}</div>
          {row(integrations)}
        </>
      )}
      {onDismiss && (
        <button type="button" className="om-starters-off" onClick={onDismiss}>
          <XIcon size={13} /> {t.conversation.starters.dismiss}
        </button>
      )}
    </div>
  );
}
