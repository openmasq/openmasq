import { STORAGE_CONNECTORS, connectorBrandName } from "@openmasq/catalog/mcp";
import type { AskTarget } from "../../../types";
import { ChevRightIcon, CloudIcon, PlugIcon, RefreshIcon } from "../../../components/brand";
import { McpTile } from "../../../components/media/McpTile";
import { useCloudTree, parseCloudKey } from "../../../hooks/useCloudTree";
import { useMcpConnectedIds } from "../../../hooks/useMcpConnectedIds";
import { TreeRow } from "./TreeRow";

import { useT } from "../../../i18n";
/**
 * CONNECTED STORAGE (Drive, OneDrive, Dropbox) in the « Dossiers » view — the second
 * deposit, under its own group marker.
 *
 * ⚠️ Two regimes, and the row says which. An account the app knows how to BROWSE
 * (`host.cloudFs`: Drive and OneDrive by direct call, Dropbox through its own
 * listing tool) is an expandable root, exactly like a local folder: same tree, same
 * lazy expansion. The others — an unconnected account, or a server that doesn't return a
 * usable list — keep the status row that opens the connector's modal. It's main
 * that decides, by only announcing a source it knows how to list: a chevron that led
 * nowhere would be worse than no chevron.
 *
 * The row keeps its NAME and its template. The logo alone would be enough to recognize three
 * world-famous brands, but the alignment with the local roots just above — same
 * row, same status dot — is what makes the two deposits read as ONE list
 * of sources rather than two unrelated inventories.
 */
export function StorageSources({
  onOpenConnector,
  onAsk,
}: {
  /** Opens the connector's modal (over the current screen, no detour). */
  onOpenConnector?: (connectorId: string) => void;
  /** « Demander » on a remote folder or file: nothing is sent, the conversation
   *  carries the target as a TAG — folder or file, with its service — and the model will
   *  go read it with the connector's tools. The `kind` comes from the clicked entry: without it,
   *  a bare name (« patrons ») read as a concept, not as the clicked folder. */
  onAsk?: (target: AskTarget) => void;
}) {
  const t = useT();
  const connected = useMcpConnectedIds();
  const cloud = useCloudTree(true);
  /* A browsable account replaces its status row with its root — otherwise it would appear
     twice, once as a tree and once as a status. */
  const browsable = new Set(cloud.sources.map((s) => s.connectorId));

  return (
    <>
      <div className="rr-tree-group" title={t.shell.folders.connectedStorage}>
        <span className="rr-group-ico" aria-hidden="true">
          <CloudIcon size={13} />
        </span>
        <span className="cv-eyebrow rr-group-lbl">{t.shell.folders.cloud}</span>
        <span className="rr-group-rule" aria-hidden="true" />
      </div>
      {cloud.rows.map(({ key, entry, depth, expanded, loading, failed }) => {
        const { sourceId } = parseCloudKey(entry.path);
        const source = cloud.sources.find((s) => s.id === sourceId);
        const connector = STORAGE_CONNECTORS.find((c) => c.id === source?.connectorId);
        const label = (connector && connectorBrandName(connector.id)) ?? entry.name;
        return depth === 0 ? (
          <button
            key={key}
            type="button"
            className="rr-src"
            title={t.shell.folders.sourceLabel(connector?.name ?? label, source?.label ?? "")}
            onClick={() => cloud.toggle(entry.path)}
          >
            <span className={`rr-tree-chev${expanded ? " open" : ""}`} aria-hidden="true">
              <ChevRightIcon size={11} />
            </span>
            {connector && (
              <McpTile id={connector.id} name={connector.name} tone={connector.tone ?? "sky"} sm />
            )}
            <span className="rr-src-name">{label}</span>
            {failed ? (
              <span className="rr-tree-failed" title={t.shell.folders.accountFailed}>
                !
              </span>
            ) : loading ? (
              <span className="rr-tree-loading">…</span>
            ) : (
              <span className="rr-src-dot" aria-hidden="true" />
            )}
          </button>
        ) : (
          <TreeRow
            key={key}
            entry={entry}
            depth={depth}
            expanded={expanded}
            loading={loading}
            failed={failed}
            onToggle={() => cloud.toggle(entry.path)}
            /* A remote file does NOT open in the panel: its bytes don't pass
               through this route. Clicking it ASKS — what the model knows how to do. */
            onOpen={() =>
              onAsk?.({
                kind: entry.kind === "dir" ? "folder" : "file",
                name: entry.name,
                /* `label`, not `connector.name`: the tag and the model's context
                   line carry the SERVICE (« Google Drive »), not the catalog's UI
                   suffix (« (lecture) »). */
                source: connector ? label : undefined,
              })
            }
            onAsk={(e) =>
              onAsk?.({
                kind: e.kind === "dir" ? "folder" : "file",
                name: e.name,
                source: connector ? label : undefined,
              })
            }
          />
        );
      })}
      {STORAGE_CONNECTORS.filter((c) => !browsable.has(c.id)).map((c) => {
        const on = connected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className={`rr-src${on ? "" : " off"}`}
            /* The full status lives in the tooltip: at 214 px, one sentence per row
               fills the panel with explanations and hides what you came there to find. */
            title={
              on
                ? `${c.name} — connecté, accessible au modèle. Ouvrir ses réglages.`
                : `${c.name} — non connecté. Se connecter.`
            }
            onClick={() => onOpenConnector?.(c.id)}
          >
            <span className="rr-tree-chev" aria-hidden="true" />
            {/* The provider's mark: three storage sources are told apart by
                their logo before their name. Same tile as the connector cards. */}
            <McpTile id={c.id} name={c.name} tone={c.tone ?? "sky"} sm />
            {/* « (lecture) » says nothing here — this whole panel is read-only, and the
                full name stays in the tooltip. */}
            <span className="rr-src-name">{connectorBrandName(c.id) ?? c.name}</span>
            {/* Connected: a dot. Otherwise the plug, which IS the action. Two glyphs of
                the same width, so the rows align whatever their state. */}
            {on ? (
              <span className="rr-src-dot" aria-hidden="true" />
            ) : (
              <span className="rr-src-cta" aria-hidden="true">
                <PlugIcon size={13} />
              </span>
            )}
          </button>
        );
      })}
      {cloud.error && (
        <p className="rr-tree-error">
          {cloud.error}{" "}
          <button type="button" className="rr-tree-retry" onClick={cloud.refresh}>
            <RefreshIcon size={12} /> Réessayer
          </button>
        </p>
      )}
    </>
  );
}
