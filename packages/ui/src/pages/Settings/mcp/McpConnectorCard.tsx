import { CheckIcon, KeyIcon, LockIcon } from "../../../components/brand";
import { McpTile } from "../../../components/media/McpTile";
import { authTagOf } from "./mcpAuth";
import { connectorErrorText } from "./connectorErrorText";
import type { McpItem } from "./mcpItems";

/** "2 comptes" — shown only when this connector actually has several linked. */
function accountsLine(item: McpItem): string {
  const n = item.accounts?.filter((a) => a.connected).length ?? 0;
  return n > 1 ? `${n} comptes` : "";
}

/**
 * One MCP connector as a clickable ROW card. NO connect/disconnect buttons — the whole
 * card opens the detail modal (`onOpen`), which holds every action.
 *
 * Reskinned to the kit's row layout: tile · (name + Connecté badge / 1-line desc) · a
 * right-aligned META column (tool count · auth tag) · the "Connecter →" / "Gérer →" CTA,
 * with the marker bar wiping in behind it on hover. A CONNECTED connector is lime-tinted
 * with a stronger border, so "what am I actually running" reads at a glance across the
 * grid instead of hiding in a badge.
 */
export function McpConnectorCard({ item, onOpen }: { item: McpItem; onOpen: () => void }) {
  const tag = authTagOf(item);
  const accounts = accountsLine(item);

  return (
    <button
      type="button"
      className={`mcp-card ${item.connected ? "on" : ""}`}
      onClick={onOpen}
      title={item.name}
    >
      <McpTile id={item.id} name={item.name} tone={item.tone} />
      <span className="mcp-card-body">
        <span className="mcp-card-name-row">
          <span className="mcp-card-name">{item.name}</span>
          {/* How many tools it adds to a turn — next to the NAME, because it qualifies
              the integration itself, not the action you are about to take. */}
          {item.toolCount != null && (
            <span className="mcp-card-tools">
              {item.toolCount} outil{item.toolCount > 1 ? "s" : ""}
            </span>
          )}
          {accounts && <span className="mcp-card-accounts">{accounts}</span>}
          {item.locked ? (
            <span className="mcp-lock" title="Bloqué par votre organisation">
              <LockIcon size={9} /> Org
            </span>
          ) : (
            item.connected && (
              <span className="mcp-badge">
                <CheckIcon size={9} /> Connecté
              </span>
            )
          )}
        </span>
        {/* Une panne REMPLACE la description — c'est voulu (on ne cache pas l'échec) —
            mais dans la langue de l'utilisateur : le message brut du fournisseur ne lui
            apprenait rien et effaçait ce qu'est le service (`connectorErrorText`). */}
        <span className={`mcp-card-desc ${item.error ? "error" : ""}`}>
          {item.error ? (connectorErrorText(item.error)?.text ?? item.error) : item.desc}
        </span>
      </span>
      {/* Right column: the action, and UNDER it how you'll connect — the chip qualifies
          the click you are about to make, so it sits with it rather than in a meta pile. */}
      <span className="mcp-card-actions">
        <span className={`mcp-card-cta ${item.connected ? "on" : ""}`} aria-hidden="true">
          {item.connected ? "Gérer →" : "Connecter →"}
        </span>
        <span className={`mcp-auth-badge auth-${tag.kind}`} title={tag.title}>
          <KeyIcon size={10} /> {tag.label}
        </span>
      </span>
    </button>
  );
}
