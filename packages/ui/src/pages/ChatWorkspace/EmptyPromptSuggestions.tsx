import { EditIcon, SearchIcon, MemoryIcon, ActivityIcon, XIcon } from "../../components/brand";
import { McpTile } from "../../components/media/McpTile";
import { findConnector } from "@openmasq/catalog/mcp";
import { useOpenConnector } from "../../containers/providers/connectors";
import { useMcpConnectedIds } from "../../hooks/useMcpConnectedIds";
import { pickStarters, type PickedStarter } from "./starters";
import { useFeatureAccess } from "../../state/billing/featureAccess";
import type { ReactNode } from "react";

import { useT } from "../../i18n";
/**
 * The empty-thread prompt starters — TWO rows of four.
 *
 * « Sans rien configurer » works on any install. « Avec vos services » is the same idea on
 * the user's OWN data, and it is the row that must not lie: a service that IS connected
 * sends its prompt, one that is NOT offers to connect (opening the connector modal over
 * whatever screen you are on) instead of asking a question nothing can answer. Which is
 * which is `starters.ts` (pure, tested).
 *
 * Both rows show at once rather than behind a switch: a first-time user and someone with
 * five connectors are looking for different things, and neither should have to guess that
 * the other half exists.
 *
 * The tiles of universal cards are NEUTRAL (monochrome) on purpose — the highlight hues
 * are the REDACTION's colour language, and wearing them on ordinary category badges
 * diluted that meaning. An INTEGRATION card is the exception and wears the service's real
 * mark: it is the card's whole claim ("this is about YOUR mailbox").
 */

/** The glyph a universal starter wears, by id. */
const UNIVERSAL_ICON: Record<string, ReactNode> = {
  write: <EditIcon size={16} />,
  search: <SearchIcon size={16} />,
  memory: <MemoryIcon size={16} />,
  analyse: <ActivityIcon size={16} />,
};

function StarterCard({
  starter,
  onPick,
}: {
  starter: PickedStarter;
  onPick: (prompt: string) => void;
}) {
  const t = useT();
  const connector = starter.connectorId ? findConnector(starter.connectorId) : undefined;
  return (
    <button
      type="button"
      className="om-starter"
      // The WHOLE prompt is here: the card only shows one line of it (the height is
      // the welcome screen itself), the branded tooltip renders the rest on hover —
      // preceded by the category, which is no longer written on the card.
      title={t.conversation.starters.cardTip(connector?.name ?? starter.cat, starter.prompt)}
      aria-label={t.conversation.starters.cardAria(connector?.name ?? starter.cat, starter.prompt)}
      onClick={() => onPick(starter.prompt)}
    >
      {/* ONE line, and the CATEGORY is no longer written there: stacked, the card was 78px
          and eight cards 538 — the welcome screen overflowed at the bottom after pushing the greeting
          up top. Written beside it, it left « Rédige un email de… » and the prompt
          said nothing anymore. So the glyph alone carries it (four distinct icons, the service's
          LOGO otherwise), and the word stays in the tooltip and the accessible name. */}
      {connector ? (
        <McpTile id={connector.id} name={connector.name} tone={connector.tone ?? "mint"} sm />
      ) : (
        <span className="om-starter-tile">{UNIVERSAL_ICON[starter.id]}</span>
      )}
      <span className="om-starter-prompt">{starter.prompt}</span>
    </button>
  );
}

/**
 * A NON-connected service: a CHIP, not a card.
 *
 * Four cards repeating "Connecter pour l'essayer sur vos données" said the same
 * thing four times and took up half the welcome screen — to the point of pushing the greeting
 * off screen. The offer fits on one line: the logo, the name, and the action.
 */
function ConnectChip({
  starter,
  onConnect,
}: {
  starter: PickedStarter;
  onConnect: (connectorId: string) => void;
}) {
  const t = useT();
  const connector = starter.connectorId ? findConnector(starter.connectorId) : undefined;
  if (!connector) return null;
  return (
    <button
      type="button"
      className="om-starter-chip"
      title={t.conversation.starters.connectTip(connector.name, starter.prompt)}
      onClick={() => onConnect(connector.id)}
    >
      <McpTile id={connector.id} name={connector.name} tone={connector.tone ?? "mint"} sm />
      {connector.name}
    </button>
  );
}

export function EmptyPromptSuggestions({
  onPick,
  onSeeAll,
  onDismiss,
}: {
  onPick: (prompt: string) => void;
  /** Opens the FULL list of connectors. The chips only show the starters'
   *  services — without this door, the whole catalogue doesn't exist for someone arriving here. */
  onSeeAll?: () => void;
  /** « Ne plus proposer » — absent ⇒ the cards cannot be dismissed. */
  onDismiss?: () => void;
}) {
  const t = useT();
  // Live: connecting a service in Réglages re-picks the cards on the way back, with no
  // reload. Absent host.mcp (web preview) ⇒ empty, so every integration card is an offer.
  const access = useFeatureAccess();
  const { universal, integrations } = pickStarters(useMcpConnectedIds(), {
    memoryOpen: access.memory,
  });
  const openConnector = useOpenConnector();
  // Connected = cards (they carry a real question); the rest = chips.
  // With no opener mounted (test bench, test), an offer leads nowhere: it stays silent.
  const live = integrations.filter((s) => s.connected);
  const offers = openConnector ? integrations.filter((s) => !s.connected) : [];
  const row = (list: PickedStarter[]) => (
    <div className="om-starters">
      {list.map((s) => (
        <StarterCard key={s.id} starter={s} onPick={onPick} />
      ))}
    </div>
  );
  return (
    <div className="om-starters-wrap">
      <div className="cv-eyebrow om-starters-title">{t.conversation.starters.noSetup}</div>
      {row(universal)}
      {(live.length > 0 || offers.length > 0) && (
        <>
          <div className="cv-eyebrow om-starters-title">{t.conversation.starters.withServices}</div>
          {live.length > 0 && row(live)}
          {offers.length > 0 && (
            <div className="om-starter-chips">
              <span className="om-starter-chips-lead">{t.conversation.starters.orConnect}</span>
              {offers.map((s) => (
                <ConnectChip key={s.id} starter={s} onConnect={openConnector!} />
              ))}
              {/* The chips only carry the starters' services — four out of a
                  much larger catalogue. The door to the rest therefore reads at the end of
                  the row, right where you just noticed yours isn't there. */}
              {onSeeAll && (
                <button type="button" className="om-starter-chip more" onClick={onSeeAll}>
                  {t.conversation.starters.seeOthers}
                </button>
              )}
            </div>
          )}
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
