import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useHost } from "../../../host";
import type { Settings } from "../../../types";
import { McpAgentPowers } from "./McpAgentPowers";
import { PlusIcon, SearchIcon } from "../../../components/brand";
import { type McpItem } from "./mcpItems";
import { Btn } from "./McpBtn";
import { useMcpConnectors } from "./useMcpConnectors";
import { McpConnectorCard } from "./McpConnectorCard";
import { McpCustomModal } from "./McpCustomModal";
import { McpModals } from "./McpModals";

import { useT } from "../../../i18n";
import { mcpCategoryLabel } from "../../../help/catalogCopy";
/* MCP servers tab — a searchable 2-column card grid grouped by category. The cards
   carry NO connect/disconnect buttons: clicking one opens a single detail modal
   that holds every action (remote OAuth / desktop-direct managed+BYO / local stdio).
   All host calls + redaction are unchanged — this is a visual reorganization. */
export function McpTab({
  allowedMcpIds,
  requestedConnector,
  draft,
  setDraft,
}: {
  allowedMcpIds?: string[];
  /** Deep-link: preselect (open the modal of) this connector — used by the chat's
   *  suggested-integration cards. The `n` nonce re-applies even for the same id. */
  requestedConnector?: { id: string; n: number };
  /** The settings draft — the agent-browser hardening (« Ce que l'agent peut faire »)
   *  writes `browserReadOnly` / `browserAllowedDomains` through it. Absent (a caller
   *  with no settings) ⇒ that section is not drawn. */
  draft?: Settings;
  setDraft?: (updater: (s: Settings) => Settings) => void;
} = {}) {
  const t = useT();
  const host = useHost();
  // The whole object is passed as-is to `McpModals` (the modal stack, shared with
  // `ConnectorModalHost`); the tab only destructures what its GRID displays.
  const c = useMcpConnectors({ allowedMcpIds, requestedConnector });
  const {
    servers,
    query,
    setQuery,
    setOpenId,
    items,
    groups,
    localItems,
    customItems,
    nothing,
    addCustom,
  } = c;
  // The "add a server" affordance exists ONLY where the platform can actually vet the
  // endpoint (main mints the id + runs the SSRF guard). Absent slot ⇒ no button.
  const [adding, setAdding] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const canAddCustom = !!host.mcp?.addCustom;

  // The E2E-synced integrations DIRECTORY: connectors the account connected on
  // its OTHER devices (config only — no credential syncs; "Connecter" runs THIS
  // device's own OAuth/key flow via the existing connector modal). Hidden when
  // every remote entry is already connected here (matched by connector+label).
  // ⚠️ BEFORE the early return `!host.mcp`: a hook after a conditional return makes
  // hook order depend on the platform slot — latent today (`host` is
  // stable per platform), a crash the day it no longer is (rules of hooks).
  const [remote, setRemote] = useState<
    { id: string; connectorId: string; name: string; label?: string }[]
  >([]);
  useEffect(() => {
    let gone = false;
    void host.mcp
      ?.syncedIntegrations?.()
      .then((list) => {
        if (!gone && list) setRemote(list);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [host]);

  if (!host.mcp) {
    return (
      <section className="settings-section">
        <div className="cv-eyebrow">{t.mcpTab.eyebrow}</div>
        <p className="mcp-empty">{t.mcpTab.unavailable}</p>
      </section>
    );
  }

  const connectedCount = items.filter((i) => i.connected).length;

  const remoteToOffer = remote.filter(
    (r) =>
      items.some((i) => i.id === r.connectorId) && // a connector this device knows
      !servers.some(
        (s) =>
          s.connected &&
          (s.connectorId ?? s.id) === r.connectorId &&
          (s.label ?? "") === (r.label ?? ""),
      ),
  );

  const grid = (list: McpItem[]) => (
    <div className="mcp-grid">
      {list.map((it) => (
        <McpConnectorCard key={it.id} item={it} onOpen={() => setOpenId(it.id)} />
      ))}
    </div>
  );

  return (
    <>
      <section className="settings-section">
        <div className="mcp-head">
          <div className="cv-eyebrow">{t.mcpTab.eyebrow}</div>
          <div className="mcp-count">{t.mcpTab.count(connectedCount, items.length)}</div>
        </div>
        <div className="mcp-search-row">
          <label className="audit-search mcp-search">
            <SearchIcon size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.mcpTab.search}
            />
          </label>
          {canAddCustom && (
            <button
              type="button"
              className="mcp-btn subtle mcp-add-btn"
              onClick={() => setAdding(true)}
              title={t.mcpTab.addTip}
            >
              <PlusIcon size={14} /> {t.mcpTab.add}
            </button>
          )}
        </div>

        {remoteToOffer.length > 0 && (
          <div className="mcp-group">
            <div className="cv-eyebrow mcp-cat-eyebrow">{t.mcpTab.otherDevices}</div>
            <div className="flex flex-col gap-2">
              {remoteToOffer.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {r.name}
                    {r.label ? <span className="text-muted"> · {r.label}</span> : null}
                  </span>
                  <Btn
                    subtle
                    label={t.mcpTab.connectHere}
                    onClick={() => setOpenId(r.connectorId)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.id} className="mcp-group">
            <div className="cv-eyebrow mcp-cat-eyebrow">{mcpCategoryLabel(group.id, t)}</div>
            {grid(group.items)}
          </div>
        ))}

        {localItems.length > 0 && (
          <div className="mcp-group">
            <div className="cv-eyebrow mcp-cat-eyebrow">{t.mcpTab.localServers}</div>
            {grid(localItems)}
          </div>
        )}

        {/* User-added servers keep their own section: they are not audited connectors and
          must not read as one, sitting inside a category next to the vetted ones. */}
        {customItems.length > 0 && (
          <div className="mcp-group">
            <div className="cv-eyebrow mcp-cat-eyebrow">{t.mcpTab.addedByYou}</div>
            {grid(customItems)}
          </div>
        )}

        {nothing && <p className="mcp-empty">{t.mcpTab.noMatch(query)}</p>}

        {/* The SAME stack as elsewhere in the app (`ConnectorModalHost`) — a single
          implementation of the connect/disconnect wiring, not two copies (rule 9). */}
        <McpModals c={c} />

        <AnimatePresence>
          {adding && (
            <McpCustomModal
              busy={addBusy}
              onClose={() => setAdding(false)}
              onAdd={async (input) => {
                setAddBusy(true);
                try {
                  return await addCustom(input);
                } finally {
                  setAddBusy(false);
                }
              }}
            />
          )}
        </AnimatePresence>
      </section>
      {/* The agent's guardrails — write gate + browser hardening — as ONE section: the
          browser tab keeps only its search engine (`McpAgentPowers`). */}
      {draft && setDraft && <McpAgentPowers settings={draft} setSettings={setDraft} />}
    </>
  );
}
