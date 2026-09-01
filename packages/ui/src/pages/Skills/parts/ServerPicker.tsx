import { CheckIcon } from "../../../components/brand";
import { McpTile } from "../../../components/media/McpTile";
import { MCP_CONNECTORS, groupByMcpCategory } from "@openmasq/catalog/mcp";

import { useT } from "../../../i18n";
import { connectorCopy, mcpCategoryLabel } from "../../../help/catalogCopy";
/** The connector catalog grouped in the canonical category order — static, so
 *  built once at module level (same grouping as Settings → MCP). */
const SERVER_GROUPS = groupByMcpCategory(MCP_CONNECTORS);

/**
 * The choice of a skill's CONNECTORS: « Toutes les intégrations » by default, then one
 * chip per catalogue connector, grouped by category, each carrying a live « connecté »
 * marker.
 *
 * SEMANTICS: an EMPTY `selected` = every integration stays available — that is exactly
 * what `competences/launch.ts` treats as « aucune ligne de consigne », and what a skill
 * was before the two lists became one. Choosing some RESTRICTS the skill to those (they
 * are named in the instruction at launch, and they widen the turn's tool scope).
 * Restricting is a choice; the empty state is the permissive one.
 *
 * `servers` is INSTRUCTION to the model + presentation — the agent loop's tool-call
 * barriers are unchanged (`competences/launch.ts`), so nothing here is a security
 * boundary; the « connecté » marker is only there to see clearly.
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
