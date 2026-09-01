import { useState } from "react";
import type { AskTarget } from "../../../types";
import { useHost, type LocalFsEntry } from "../../../host";
import {
  ChevRightIcon,
  FolderIcon,
  HardDriveIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
} from "../../../components/brand";
import { useFolderTree } from "../../../hooks/useFolderTree";
import { StorageSources } from "./StorageSources";
import { TreeRow } from "./TreeRow";
import { FILESYSTEM_CONNECTOR_ID, localServerId } from "../../../state/conversation/mcpIds";
import { panelOpenLocalFile, useAppDispatch } from "../../../state/redux";

import { useT } from "../../../i18n";
/**
 * « Dossiers » — the file sources, in the right-hand bar.
 *
 * Two deposits answering the same question ("where is this document?") that differ
 * only in where the bytes live: folders GRANTED on this machine, browsed as a tree,
 * and CONNECTED STORAGE (Drive, OneDrive, Dropbox), whose row states the status and
 * leads to its setting.
 *
 * ⚠️ Connected storage does NOT expand into a tree, and that's a limit, not an
 * oversight: these connectors only expose their files through tools built for a model
 * (prose, a redacted call, no typed listing) — which is exactly why `host.localFs`
 * exists on the local side. Listing them without a tree tells the truth; a fake tree
 * would lie about what the app can do.
 *
 * Opening a file dispatches the SAME `panelOpenLocalFile` as everywhere else: it lands
 * in THE shared side panel, re-read from disk. Looking isn't sending — rule 11
 * governs what the MODEL sees; the moment that flips is « Demander ».
 */
export function FolderTreePanel({
  onManageFolders,
  onOpenConnector,
  onAskTarget,
}: {
  /** Open Réglages → Connecteurs on the Filesystem connector. */
  onManageFolders?: () => void;
  /** Open Réglages → Connecteurs on a storage connector. */
  onOpenConnector?: (connectorId: string) => void;
  /** Start a conversation ABOUT a target — staged as a TAG (folder/file,
   *  local/cloud), never as draft prose; the model has the connector's tools
   *  to go read it. Absent ⇒ the hover action isn't offered. */
  onAskTarget?: (target: AskTarget) => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const host = useHost();
  const tree = useFolderTree(true);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const mcp = host.mcp;
  const canAdd = !!mcp?.pickDir && !!mcp?.setDirs;
  /* A NEW folder can only come from the native picker: the host checks it on the
     privileged side, the renderer cannot assign itself a path.
     Three things a shortcut misses here, which make a button that "does nothing":
      · the targeted server is `local-filesystem`, not `filesystem` (`state/mcpIds.ts`);
      · the LIST starts from what the server actually has registered — `setDirs` replaces,
        so sending only the new path would silently revoke the others;
      · a refusal comes back in `info.error`, it is NOT thrown: without reading it, the
        failure exists nowhere on screen;
      · and the connector may not be connected at all — that's even the default state
        of a fresh install, the one where this button gets clicked the most. */
  const addFolder = async () => {
    if (!mcp?.pickDir || !mcp.setDirs || adding) return;
    setAdding(true);
    setAddError("");
    try {
      const serverId = localServerId(FILESYSTEM_CONNECTOR_ID);
      const server = (await mcp.list()).find((s) => s.id === serverId);
      // The param key comes from the server itself when it exists; otherwise `root`,
      // which is what main's catalog declares (`mcp/catalog.ts`) — and already the
      // fallback this file used.
      const key = server ? (Object.keys(server.params ?? {})[0] ?? "root") : "root";
      const current = server ? (server.params?.[key] ?? tree.roots) : [];

      // ⚠️ THE PICKER FIRST, even with no connector. The folder isn't a connector
      // setting: it IS the AUTHORIZATION itself, and the server refuses to be
      // registered without it (« Dossiers autorisés requis » — `root` is required). Trying
      // to install it empty to "fix" it before asking therefore always fails.
      const picked = await mcp.pickDir();
      if (!picked || current.includes(picked)) return;

      // Connector absent ⇒ install it WITH the folder that was just granted, then
      // connect it. The user has nothing to connect themselves: they chose a
      // folder, the integration sets itself up behind the scenes. Nothing is authorized
      // along the way — the root stays what the NATIVE dialog returned (`main/fs/CLAUDE.md`).
      if (!server) {
        const added = await mcp.addStdio(FILESYSTEM_CONNECTOR_ID, {}, { [key]: [picked] });
        if (added?.error) {
          setAddError(added.error);
          return;
        }
        const started = await mcp.connect(serverId);
        if (started?.error) setAddError(started.error);
        else tree.refresh();
        return;
      }
      // Registered but off: reconnect it, otherwise `setDirs` would write into the void.
      if (server.connected === false) {
        const started = await mcp.connect(serverId);
        if (started?.error) {
          setAddError(started.error);
          return;
        }
      }
      const info = await mcp.setDirs(server.id, key, [...current, picked]);
      if (info?.error) setAddError(info.error);
      else tree.refresh();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rr-tree">
      <div className="rr-list rr-tree-list">
        {/* A GROUP is marked by its icon, not by a sentence: at 214 px, two
            section labels cost one line each and say what the two
            glyphs already oppose (the disk here / the cloud below). The whole title
            stays in the tooltip and in the accessible name. */}
        <div className="rr-tree-group" title={t.shell.folders.onThisDevice}>
          <span className="rr-group-ico" aria-hidden="true">
            <HardDriveIcon size={13} />
          </span>
          <span className="cv-eyebrow rr-group-lbl">{t.shell.folders.local}</span>
          <span className="rr-group-rule" aria-hidden="true" />
          {onManageFolders && (
            <button
              type="button"
              className="rr-tree-gear"
              title={t.shell.folders.manageFolders}
              aria-label={t.shell.folders.manageFolders}
              onClick={onManageFolders}
            >
              <SettingsIcon size={13} />
            </button>
          )}
        </div>
        {tree.rows.map(({ key, entry, depth, expanded, loading, failed }) =>
          depth === 0 ? (
            <SourceRow
              key={key}
              entry={entry}
              expanded={expanded}
              loading={loading}
              onToggle={() => tree.toggle(entry.path)}
            />
          ) : (
            <TreeRow
              key={key}
              entry={entry}
              depth={depth}
              expanded={expanded}
              loading={loading}
              failed={failed}
              onToggle={() => tree.toggle(entry.path)}
              onOpen={() => dispatch(panelOpenLocalFile({ path: entry.path, name: entry.name }))}
              /* « Demander » is only offered on a local FOLDER (TreeRow) — a
                 local file goes through the bytes (`LocalFilePanel`). */
              onAsk={(e) => onAskTarget?.({ kind: "folder", name: e.name, path: e.path })}
            />
          ),
        )}
        {tree.roots.length === 0 && (
          <div className="rr-empty">{t.shell.folders.noFolders}</div>
        )}
        {canAdd && (
          <button
            type="button"
            className="rr-tree-add"
            title={t.shell.folders.addFolder}
            aria-label={t.shell.folders.addFolder}
            aria-busy={adding}
            onClick={() => void addFolder()}
          >
            {/* The "+" is enough on a dashed bar: the shape says "add here"
                just as well as the word. During the native selection, the glyph pulses —
                the state doesn't take up space, it changes it. */}
            <PlusIcon size={14} />
          </button>
        )}

        <StorageSources onOpenConnector={onOpenConnector} onAsk={onAskTarget} />
      </div>

      {/* A real failure is stated: folder removed, disk unplugged, authorization revoked. */}
      {(tree.error || addError) && (
        <p className="rr-tree-error">
          {tree.error || addError}{" "}
          <button type="button" className="rr-tree-retry" onClick={tree.refresh}>
            <RefreshIcon size={12} /> Réessayer
          </button>
        </p>
      )}

    </div>
  );
}

/** A granted ROOT: the row carries where it comes from, which the folder
 *  name alone doesn't say ("Documents" — which one?). */
function SourceRow({
  entry,
  expanded,
  loading,
  onToggle,
}: {
  entry: LocalFsEntry;
  expanded: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    /* The full path is in the tooltip, not under the name: two lines per root
       doubled the group's height for information read once. */
    <button type="button" className="rr-src" title={entry.path} onClick={onToggle}>
      <span className={`rr-tree-chev${expanded ? " open" : ""}`} aria-hidden="true">
        <ChevRightIcon size={11} />
      </span>
      <span className="rr-tree-glyph" aria-hidden="true">
        <FolderIcon size={14} />
      </span>
      <span className="rr-src-name">{entry.name}</span>
      {loading && <span className="rr-tree-loading">…</span>}
    </button>
  );
}
