import { findConnector, type McpConnector } from "@openmasq/catalog/mcp";
import { MCP_LOGOS, MCP_LOGO_IMAGES } from "../media/McpTile";
import { CheckIcon, LockIcon, ArrowRightIcon, GridIcon } from "../brand";
import { AgentCard, GlyphTile, AgentCardTitle, AgentCardDesc } from "./AgentCard";
import { BRAND } from "@openmasq/branding";

/**
 * "Connect this integration to continue" — rendered under an assistant bubble when the
 * model couldn't fulfil the request for lack of a NOT-connected connector (it called
 * `suggest_integrations`). One `AgentCard` per suggested connector, so it reads as part of
 * the in-chat container family (design kit `IntegrationProposalCard`).
 *
 * Ids resolve to their catalog display metadata (name / desc / tone / logo / scopes);
 * the CTA deep-links to Réglages → MCP with that connector preselected (`onConnect`).
 *
 * The CONNECTED state is driven by `connectedIds` — the REAL live connector set, not a
 * local timer. The kit animates idle→connecting→connected on a `setTimeout` because it is
 * a demo; here connecting happens in Réglages (OAuth, another window), so the honest
 * signal is "is it actually connected now". When the user comes back having connected, the
 * card flips to Connecté + Continuer. Pure presentation.
 */
export function IntegrationSuggestions({
  ids,
  connectedIds,
  onConnect,
  onResume,
}: {
  ids: string[];
  /** Live connector ids currently connected (from `host.mcp`), threaded by the shell. */
  connectedIds?: string[];
  onConnect: (connectorId: string) => void;
  /** « Continuer » once connected: RESUME the turn that produced this suggestion
   *  (regenerate it — the model replays the original ask, now WITH the tools).
   *  Without it the connected card's CTA deep-linked back to Réglages, the same
   *  action as « Connecter » — a dead end when there is nothing left to connect. */
  onResume?: () => void;
}) {
  const connectors = ids.map((id) => findConnector(id)).filter((c): c is McpConnector => !!c);
  if (connectors.length === 0) return null;
  const connected = new Set(connectedIds ?? []);

  // SEVERAL suggestions → ONE card of compact 2-per-row tiles (design kit
  // `IntegrationProposalsCard`): a stack of full cards buried the conversation under
  // repeated shells for what is a single decision ("connect your tools"). A single
  // suggestion keeps the full card (scopes, desc, explicit CTA).
  if (connectors.length > 1) {
    return (
      <div className="integration-suggest">
        <IntegrationTilesCard connectors={connectors} connected={connected} onConnect={onConnect} />
      </div>
    );
  }

  return (
    <div className="integration-suggest">
      {connectors.map((c) => (
        <IntegrationCard
          key={c.id}
          connector={c}
          connected={connected.has(c.id)}
          onConnect={onConnect}
          onResume={onResume}
        />
      ))}
    </div>
  );
}

/** The multi-suggestion card: glyph + name + one-line reason per tile, one connect
 *  action each. Connected state is the LIVE connector set (never a local timer —
 *  connecting happens in Réglages), shown as a check + disabled tile. */
function IntegrationTilesCard({
  connectors,
  connected,
  onConnect,
}: {
  connectors: McpConnector[];
  connected: Set<string>;
  onConnect: (id: string) => void;
}) {
  return (
    <AgentCard
      eyebrow={`${connectors.length} intégrations suggérées`}
      tile={
        <GlyphTile>
          <GridIcon size={18} />
        </GlyphTile>
      }
      footer={
        <span className="agent-card-note">
          <LockIcon size={13} />
          <span>Connexion sécurisée · accès chiffré, révocable à tout moment</span>
        </span>
      }
    >
      <AgentCardTitle marked>Connectez vos outils pour continuer</AgentCardTitle>
      <div className="integration-tiles">
        {connectors.map((c) => {
            const isOn = connected.has(c.id);
            const logo = MCP_LOGOS[c.id];
            const img = MCP_LOGO_IMAGES[c.id];
            const hue = `var(--hl-${c.tone ?? "violet"})`;
            return (
            <button
              key={c.id}
              type="button"
              className={`integration-tile${isOn ? " connected" : ""}`}
              disabled={isOn}
              title={isOn ? `${c.name} · connecté` : `Connecter ${c.name}`}
              onClick={() => onConnect(c.id)}
            >
              <GlyphTile bg={img ? "var(--surface-card)" : undefined} small>
                {logo ? (
                  <svg viewBox="0 0 24 24" fill={logo.hex} aria-hidden="true" width="16" height="16">
                    <path d={logo.path} />
                  </svg>
                ) : img ? (
                  <img className="agent-tile-img" src={img} alt="" aria-hidden="true" />
                ) : (
                  c.name[0]
                )}
              </GlyphTile>
              <span className="integration-tile-text">
                <span className="integration-tile-name">{c.name}</span>
                <span className="integration-tile-desc">{c.desc}</span>
              </span>
              <span className="integration-tile-go">
                {isOn ? <CheckIcon size={16} /> : <ArrowRightIcon size={16} />}
              </span>
            </button>
          );
        })}
      </div>
    </AgentCard>
  );
}

function IntegrationCard({
  connector: c,
  connected,
  onConnect,
  onResume,
}: {
  connector: McpConnector;
  connected: boolean;
  onConnect: (id: string) => void;
  onResume?: () => void;
}) {
  const logo = MCP_LOGOS[c.id];
  const img = MCP_LOGO_IMAGES[c.id];
  // A builtin (the browser) ships with the app — there's nothing to connect TO, the user
  // just switches it on, so the CTA says so.
  const builtin = c.transport === "builtin";
  const cta = builtin ? "Activer" : `Connecter ${c.name}`;
  const hue = `var(--hl-${c.tone ?? "violet"})`;
  // REAL scopes from the catalog (`direct` connectors carry them per credential mode).
  // A remote/builtin connector has none declared — show no chips rather than invent any:
  // this card tells the user what access they are granting, so a plausible-looking but
  // fabricated scope list would be a lie about their data.
  const scopes = c.scopes?.managed ?? [];

  return (
    <AgentCard
      stripe={connected ? "var(--brand)" : "var(--border-strong)"}
      eyebrow={connected ? `${c.name} · connecté` : "Intégration suggérée"}
      tile={
        logo ? (
          <GlyphTile>
            <svg viewBox="0 0 24 24" fill={logo.hex} aria-hidden="true" width="18" height="18">
              <path d={logo.path} />
            </svg>
          </GlyphTile>
        ) : img ? (
          <GlyphTile bg="var(--surface-card)">
            <img className="agent-tile-img" src={img} alt="" aria-hidden="true" />
          </GlyphTile>
        ) : (
          <GlyphTile>
            {c.name[0]}
          </GlyphTile>
        )
      }
      footer={
        connected ? (
          <>
            <span className="agent-card-resolved done">
              <CheckIcon size={14} /> Connecté — {BRAND.name} peut reprendre
            </span>
            <span className="agent-card-spacer" />
            {/* REPRENDRE le tour (régénérer), pas re-déep-linker vers Réglages : il n'y
                a plus rien à connecter, le seul geste utile est de relancer la demande. */}
            <button
              className="btn-primary btn-inline"
              onClick={() => (onResume ? onResume() : onConnect(c.id))}
            >
              Continuer <ArrowRightIcon size={14} />
            </button>
          </>
        ) : (
          <>
            <span className="agent-card-note">
              <LockIcon size={13} />
              <span>
                {builtin
                  ? `Intégré à ${BRAND.name} — rien à connecter, aucun compte tiers.`
                  : "Connexion sécurisée · accès chiffré, révocable à tout moment"}
              </span>
            </span>
            <span className="agent-card-spacer" />
            <button className="btn-primary btn-inline" onClick={() => onConnect(c.id)}>
              {cta}
            </button>
          </>
        )
      }
    >
      <AgentCardTitle marked={!connected}>
        {builtin ? `Activez ${c.name} pour continuer` : `Connectez ${c.name} pour continuer`}
      </AgentCardTitle>
      <AgentCardDesc>{c.desc}</AgentCardDesc>
      {scopes.length > 0 && (
        // Kit refinement: a 2-column grid (not a ragged wrap) with long scopes ellipsized.
        <div className="agent-card-chips grid2">
          {scopes.map((s) => (
            <span key={s} className="agent-card-chip">
              {connected && (
                <span className="chip-check">
                  <CheckIcon size={11} />
                </span>
              )}
              <span className="chip-label">{scopeLabel(s)}</span>
            </span>
          ))}
        </div>
      )}
    </AgentCard>
  );
}

/** An OAuth scope URL is unreadable — show its last segment (`gmail.send`, `repo`). */
function scopeLabel(scope: string): string {
  const tail = scope.split("/").pop() ?? scope;
  return tail.replace(/^auth\./, "");
}
