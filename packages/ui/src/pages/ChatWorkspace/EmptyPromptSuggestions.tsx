import { EditIcon, SearchIcon, MemoryIcon, ActivityIcon, XIcon } from "../../components/brand";
import { McpTile } from "../../components/media/McpTile";
import { findConnector } from "@openmasq/catalog/mcp";
import { useOpenConnector } from "../../containers/providers/connectors";
import { useMcpConnectedIds } from "../../hooks/useMcpConnectedIds";
import { pickStarters, type PickedStarter } from "./starters";
import { useFeatureAccess } from "../../state/featureAccess";
import type { ReactNode } from "react";

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
  const connector = starter.connectorId ? findConnector(starter.connectorId) : undefined;
  return (
    <button
      type="button"
      className="om-starter"
      // L'invite ENTIÈRE est ici : la carte n'en montre qu'une ligne (la hauteur est
      // l'écran d'accueil lui-même), l'infobulle de marque rend le reste au survol —
      // précédée de la catégorie, qui n'est plus écrite sur la carte.
      title={`${connector?.name ?? starter.cat} — ${starter.prompt}`}
      aria-label={`${connector?.name ?? starter.cat} : ${starter.prompt}`}
      onClick={() => onPick(starter.prompt)}
    >
      {/* UNE ligne, et la CATÉGORIE n'y est plus écrite : empilée, la carte faisait 78 px
          et huit cartes 538 — l'accueil débordait par le bas après avoir poussé le bonjour
          par le haut. Écrite à côté, elle laissait « Rédige un email de… » et l'invite ne
          disait plus rien. Le glyphe la porte donc seul (quatre icônes distinctes, le LOGO
          du service sinon), et le mot reste dans l'infobulle et le nom accessible. */}
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
 * Un service NON connecté : une PUCE, pas une carte.
 *
 * Quatre cartes répétant « Connecter pour l'essayer sur vos données » disaient une fois
 * la même chose et occupaient la moitié de l'accueil — au point de pousser le bonjour
 * hors de l'écran. L'offre tient sur une ligne : le logo, le nom, et le geste.
 */
function ConnectChip({
  starter,
  onConnect,
}: {
  starter: PickedStarter;
  onConnect: (connectorId: string) => void;
}) {
  const connector = starter.connectorId ? findConnector(starter.connectorId) : undefined;
  if (!connector) return null;
  return (
    <button
      type="button"
      className="om-starter-chip"
      title={`Connecter ${connector.name} — ${starter.prompt}`}
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
  /** Ouvre la liste COMPLÈTE des connecteurs. Les puces ne montrent que les services des
   *  amorces — sans cette porte, le catalogue entier n'existe pas pour qui arrive ici. */
  onSeeAll?: () => void;
  /** « Ne plus proposer » — absent ⇒ the cards cannot be dismissed. */
  onDismiss?: () => void;
}) {
  // Live: connecting a service in Réglages re-picks the cards on the way back, with no
  // reload. Absent host.mcp (web preview) ⇒ empty, so every integration card is an offer.
  const access = useFeatureAccess();
  const { universal, integrations } = pickStarters(useMcpConnectedIds(), {
    memoryOpen: access.memory,
  });
  const openConnector = useOpenConnector();
  // Connectés = des cartes (elles portent une vraie question) ; le reste = des puces.
  // Sans ouvreur monté (banc d'essai, test), une offre ne mène nulle part : on la tait.
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
      <div className="cv-eyebrow om-starters-title">Sans rien configurer</div>
      {row(universal)}
      {(live.length > 0 || offers.length > 0) && (
        <>
          <div className="cv-eyebrow om-starters-title">Avec vos services</div>
          {live.length > 0 && row(live)}
          {offers.length > 0 && (
            <div className="om-starter-chips">
              <span className="om-starter-chips-lead">Ou connectez</span>
              {offers.map((s) => (
                <ConnectChip key={s.id} starter={s} onConnect={openConnector!} />
              ))}
              {/* Les puces ne portent QUE les services des amorces — quatre sur un
                  catalogue bien plus large. La porte vers le reste se lit donc au bout de
                  la ligne, là où l'on vient de constater que le sien n'y est pas. */}
              {onSeeAll && (
                <button type="button" className="om-starter-chip more" onClick={onSeeAll}>
                  Voir les autres
                </button>
              )}
            </div>
          )}
        </>
      )}
      {onDismiss && (
        <button type="button" className="om-starters-off" onClick={onDismiss}>
          <XIcon size={13} /> Ne plus proposer
        </button>
      )}
    </div>
  );
}
