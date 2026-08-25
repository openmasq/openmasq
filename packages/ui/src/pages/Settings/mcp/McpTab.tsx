import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useHost } from "../../../host";
import { McpWriteConfirm } from "./McpWriteConfirm";
import { PlusIcon, SearchIcon } from "../../../components/brand";
import { type McpItem } from "./mcpItems";
import { Btn } from "./McpBtn";
import { useMcpConnectors } from "./useMcpConnectors";
import { McpConnectorCard } from "./McpConnectorCard";
import { McpCustomModal } from "./McpCustomModal";
import { McpModals } from "./McpModals";

/* MCP servers tab — a searchable 2-column card grid grouped by category. The cards
   carry NO connect/disconnect buttons: clicking one opens a single detail modal
   that holds every action (remote OAuth / desktop-direct managed+BYO / local stdio).
   All host calls + redaction are unchanged — this is a visual reorganization. */
export function McpTab({
  allowedMcpIds,
  requestedConnector,
}: {
  allowedMcpIds?: string[];
  /** Deep-link: preselect (open the modal of) this connector — used by the chat's
   *  suggested-integration cards. The `n` nonce re-applies even for the same id. */
  requestedConnector?: { id: string; n: number };
} = {}) {
  const host = useHost();
  // L'objet entier est passé tel quel à `McpModals` (la pile de modales, partagée avec
  // `ConnectorModalHost`) ; l'onglet ne destructure que ce que sa GRILLE affiche.
  const c = useMcpConnectors({ allowedMcpIds, requestedConnector });
  const { servers, query, setQuery, setOpenId, items, groups, localItems, customItems, nothing, addCustom } = c;
  // The "add a server" affordance exists ONLY where the platform can actually vet the
  // endpoint (main mints the id + runs the SSRF guard). Absent slot ⇒ no button.
  const [adding, setAdding] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const canAddCustom = !!host.mcp?.addCustom;

  if (!host.mcp) {
    return (
      <section className="settings-section">
        <div className="cv-eyebrow">SERVEURS MCP</div>
        <p className="mcp-empty">
          Les connecteurs MCP ne sont pas disponibles sur cette plateforme.
        </p>
      </section>
    );
  }

  const connectedCount = items.filter((i) => i.connected).length;

  // The E2E-synced integrations DIRECTORY: connectors the account connected on
  // its OTHER devices (config only — no credential syncs; "Connecter" runs THIS
  // device's own OAuth/key flow via the existing connector modal). Hidden when
  // every remote entry is already connected here (matched by connector+label).
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
        <div className="cv-eyebrow">SERVEURS MCP</div>
        <div className="mcp-count">
          {connectedCount} connecté{connectedCount === 1 ? "" : "s"} · {items.length} disponibles
        </div>
      </div>
      <div className="mcp-search-row">
        <label className="audit-search mcp-search">
          <SearchIcon size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un connecteur…"
          />
        </label>
        {canAddCustom && (
          <button
            type="button"
            className="mcp-btn subtle mcp-add-btn"
            onClick={() => setAdding(true)}
            title="Connecter un service qui n'est pas dans la liste"
          >
            <PlusIcon size={14} /> Ajouter un connecteur
          </button>
        )}
      </div>

      {remoteToOffer.length > 0 && (
        <div className="mcp-group">
          <div className="cv-eyebrow mcp-cat-eyebrow">SUR VOS AUTRES APPAREILS</div>
          <div className="flex flex-col gap-2">
            {remoteToOffer.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {r.name}
                  {r.label ? <span className="text-muted"> · {r.label}</span> : null}
                </span>
                <Btn
                  subtle
                  label="Connecter sur cet appareil"
                  onClick={() => setOpenId(r.connectorId)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.id} className="mcp-group">
          <div className="cv-eyebrow mcp-cat-eyebrow">{group.label}</div>
          {grid(group.items)}
        </div>
      ))}

      {localItems.length > 0 && (
        <div className="mcp-group">
          <div className="cv-eyebrow mcp-cat-eyebrow">SERVEURS LOCAUX</div>
          {grid(localItems)}
        </div>
      )}

      {/* User-added servers keep their own section: they are not audited connectors and
          must not read as one, sitting inside a category next to the vetted ones. */}
      {customItems.length > 0 && (
        <div className="mcp-group">
          <div className="cv-eyebrow mcp-cat-eyebrow">AJOUTÉS PAR VOUS — NON VÉRIFIÉS</div>
          {grid(customItems)}
        </div>
      )}

      {nothing && <p className="mcp-empty">Aucun connecteur ne correspond à « {query} ».</p>}

      {/* La MÊME pile qu'ailleurs dans l'app (`ConnectorModalHost`) — une seule
          implémentation du câblage connect/déconnect, pas deux copies (règle 9). */}
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
    <McpWriteConfirm />
    </>
  );
}
