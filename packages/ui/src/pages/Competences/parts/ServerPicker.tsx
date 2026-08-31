import { CheckIcon } from "../../../components/brand";
import { McpTile } from "../../../components/media/McpTile";
import { MCP_CONNECTORS, groupByMcpCategory } from "@openmasq/catalog/mcp";

import { useT } from "../../../i18n";
import { connectorCopy, mcpCategoryLabel } from "../../../help/catalogCopy";
/** The connector catalog grouped in the canonical category order — static, so
 *  built once at module level (same grouping as Settings → MCP). */
const SERVER_GROUPS = groupByMcpCategory(MCP_CONNECTORS);

/**
 * Le choix des CONNECTEURS d'une compétence : « Toutes les intégrations » par défaut,
 * puis une pastille par connecteur du catalogue, groupées par catégorie, chacune portant
 * un repère « connecté » en direct.
 *
 * SÉMANTIQUE : `selected` VIDE = toutes les intégrations restent disponibles — c'est
 * exactement ce que `competences/launch.ts` traite comme « aucune ligne de consigne », et
 * c'est ce qu'était une compétence avant que les deux listes n'en fassent qu'une. En
 * choisir RESTREINT la compétence à celles-là (elles sont nommées en consigne au
 * lancement, et elles élargissent la portée d'outils du tour). Restreindre est un choix ;
 * l'état vide est le permissif.
 *
 * `servers` est de la CONSIGNE au modèle + de la présentation — les barrières d'appel
 * d'outil de la boucle agent sont inchangées (`competences/launch.ts`), donc rien ici
 * n'est une frontière de sécurité ; le repère « connecté » n'est là que pour y voir clair.
 */
export function ServerPicker({
  selected,
  connected,
  onToggle,
  onSelectAll,
}: {
  selected: string[];
  /** Catalog ids with a connected account (`useConnectedConnectors`, queried
   *  ONCE by the page): this picker's green dot and the template strip's
   *  ranking are two readers of the same answer, so they cannot disagree. */
  connected: ReadonlySet<string>;
  /** Add/remove one connector id from the scope. */
  onToggle: (id: string) => void;
  /** Back to the permissive default (clears the scope). */
  onSelectAll: () => void;
}) {
  const t = useT();
  const allOn = selected.length === 0;

  return (
    <div className="om-skill-field">
      <p className="om-wf-picker-note">
        {t.lists.competences.picker.note} {t.lists.competences.picker.connectedDot}
      </p>
      {/* Grouped by the canonical MCP categories; ONE scroll (the modal body's) —
          an inner scroll here made two nested scrollbars. */}
      <div className="om-wf-picker">
        <button
          type="button"
          className={`om-wf-pick om-wf-pick-all${allOn ? " on" : ""}`}
          onClick={onSelectAll}
          aria-pressed={allOn}
          title={t.mcpTab.allIntegrationsTip}
        >
          {t.mcpTab.allIntegrations}
          {allOn && (
            <span className="om-wf-pick-check">
              <CheckIcon size={13} />
            </span>
          )}
        </button>

        {SERVER_GROUPS.map((g) => (
          <div key={g.id} className="om-wf-group">
            <div className="cv-eyebrow om-wf-group-h">{mcpCategoryLabel(g.id, t)}</div>
            <div className="om-wf-group-list">
              {g.items.map((c) => {
                const on = selected.includes(c.id);
                const isConnected = connected.has(c.id);
                const copy = connectorCopy(c.id, c, t);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`om-wf-pick${on ? " on" : ""}`}
                    onClick={() => onToggle(c.id)}
                    aria-pressed={on}
                    title={isConnected ? t.mcpTab.connectedDot(copy.name) : copy.desc}
                  >
                    <McpTile sm id={c.id} name={copy.name} tone={c.tone ?? "violet"} />
                    {copy.name}
                    {isConnected && (
                      <span
                        className="om-wf-pick-dot"
                        title={t.mcpTab.connected}
                        aria-label={t.mcpTab.connected}
                      />
                    )}
                    {on && (
                      <span className="om-wf-pick-check">
                        <CheckIcon size={13} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
