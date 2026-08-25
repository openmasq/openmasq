import { useCallback, useEffect, useMemo, useState } from "react";
import { connectorErrorReason } from "./connectorErrorReason";
import { groupByMcpCategory, MCP_CONNECTORS } from "@openmasq/catalog/mcp";
import { useHost, type CredMode, type McpCatalogEntry, type McpServerInfo } from "../../../host";
import { captureEvent } from "../../../analytics";
import { buildMcpItems, matchesSearch, type McpItem } from "./mcpItems";
import { apiKeyHelp, composeApiKeyUrl } from "./mcpApiKeyHelp";
import { useAddCustomServer } from "./useAddCustomServer";
import { isConnectorAllowed } from "../../../privacy/orgAllowList";

// The MCP-connectors data layer of the Settings > MCP tab — all the state, the
// host.mcp CRUD (connect/disconnect/reauth/add-account/enable-browser/remove) and
// the derived item/group lists. Extracted from McpTab.tsx so the tab is presentation
// over this hook. Behaviour + host calls are unchanged (pure relocation).
export function useMcpConnectors({
  allowedMcpIds,
  requestedConnector,
}: {
  allowedMcpIds?: string[];
  requestedConnector?: { id: string; n: number };
}) {
  const host = useHost();
  // La décision vit dans `privacy/orgAllowList.ts` — l'agent la prend aussi, et les
  // deux normalisations d'id avaient divergé (les instances multi-comptes manquaient
  // ici, donc un connecteur refusé se déverrouillait avec un second compte).
  const isBlocked = useCallback(
    (id: string): boolean => !isConnectorAllowed(id, allowedMcpIds),
    [allowedMcpIds],
  );
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([]);
  const [credGroups, setCredGroups] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(requestedConnector?.id ?? null);
  const [byoId, setByoId] = useState<string | null>(null);
  // True when the BYO-keys form is being used to ADD an account (vs connect the first).
  const [byoAdd, setByoAdd] = useState(false);
  const [inspecting, setInspecting] = useState<{ id: string; name: string } | null>(null);
  // The OAuth authorize URL of an in-flight connect (connect-id → url), pushed by main so
  // the modal can offer "Copier le lien" (open the login in another browser). Cleared at
  // each connect START so a stale URL (a prior PKCE state that no longer polls) is never
  // copyable; the fresh URL arrives once main opens the browser.
  const [connectUrls, setConnectUrls] = useState<Record<string, string>>({});
  const dropConnectUrl = useCallback(
    (id: string) =>
      setConnectUrls((m) => {
        if (!(id in m)) return m;
        const n = { ...m };
        delete n[id];
        return n;
      }),
    [],
  );

  const refresh = useCallback(() => {
    host.mcp?.list().then(setServers).catch(() => {});
    // BYO cred groups (which providers already have keys) — so a Google connector
    // shows "déjà enregistré" once any Google connector's keys were entered.
    host.mcp?.byoCredGroups?.().then((g) => setCredGroups(new Set(g))).catch(() => {});
  }, [host]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  // A chat suggested-integration card was clicked → open that connector's modal.
  // Keyed on the nonce so repeat requests re-open even for the same connector.
  useEffect(() => {
    if (requestedConnector?.id) setOpenId(requestedConnector.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedConnector?.n]);
  // Re-fetch when main reports a live change — chiefly the SILENT startup reconnect,
  // which finishes AFTER this first fetch, so an actually-reconnected connector
  // would otherwise keep showing as disconnected until the tab is reopened.
  useEffect(() => {
    return host.mcp?.onChanged?.(refresh); // l'unsubscribe, retourné EXPRÈS
  }, [host, refresh]);
  // Capture the authorize URL main emits during an interactive connect.
  useEffect(
    () => host.mcp?.onOauthUrl?.(({ id, url }) => setConnectUrls((m) => ({ ...m, [id]: url }))),
    [host],
  );
  useEffect(() => {
    host.mcp?.catalog().then(setCatalog).catch(() => {});
  }, [host]);

  const setBusyFor = (id: string, v: boolean) => setBusy((b) => ({ ...b, [id]: v }));
  const applyInfo = (info: McpServerInfo, provider: string) => {
    setServers((prev) => [...prev.filter((s) => s.id !== info.id), info]);
    captureEvent(
      info?.connected
        ? { name: "connector_connect", provider }
        : { name: "connector_error", provider, reason: "unknown" },
    );
  };

  const directConnectors = useMemo(
    () => (host.mcp?.connectDirect ? MCP_CONNECTORS.filter((c) => c.transport === "direct") : []),
    [host],
  );
  const items = useMemo(
    () =>
      buildMcpItems({
        servers,
        catalog,
        directConnectors,
        isBlocked,
        credGroups,
        browserEnabled: !!host.mcp?.enableBrowser,
      }),
    [servers, catalog, directConnectors, isBlocked, credGroups, host],
  );
  const openItem = openId ? items.find((i) => i.id === openId) ?? null : null;
  const byoItem = byoId ? items.find((i) => i.id === byoId) ?? null : null;
  const byoConnector = byoItem?.connector ?? null;

  // Remote + direct → grouped by category; local servers and USER-ADDED ones each keep
  // their own section — a custom server is not an audited connector and must not read
  // as one sitting in "Recherche & web" next to Tavily.
  const filtered = items.filter((i) => matchesSearch(i, query.trim()));
  const customItems = filtered.filter((i) => i.custom);
  const groups = groupByMcpCategory(filtered.filter((i) => i.kind !== "local" && !i.custom));
  const localItems = filtered.filter((i) => i.kind === "local");
  const nothing = groups.length === 0 && localItems.length === 0 && customItems.length === 0;

  // ── Connect flows (unchanged host calls) ────────────────────────────────────
  const connectRemote = useCallback(
    async (item: McpItem, url: string) => {
      if (!host.mcp || isBlocked(item.id)) return;
      setBusyFor(item.serverId, true);
      dropConnectUrl(item.id);
      try {
        await host.mcp.add({ id: item.id, name: item.name, url });
        applyInfo(await host.mcp.connect(item.id), item.id);
      } catch (e) {
        captureEvent({ name: "connector_error", provider: item.id, reason: connectorErrorReason(e) });
      } finally {
        setBusyFor(item.serverId, false);
      }
    },
    [host, isBlocked, dropConnectUrl],
  );

  // API-key connector authenticated by a Bearer HEADER (e.g. Fireflies): pass the
  // key to the host, which stores it ENCRYPTED and sends it as `Authorization: Bearer`.
  const connectApiKey = useCallback(
    async (item: McpItem, apiKey: string) => {
      if (!host.mcp || isBlocked(item.id)) return;
      setBusyFor(item.serverId, true);
      try {
        await host.mcp.add({ id: item.id, name: item.name, url: item.url ?? "", apiKey });
        applyInfo(await host.mcp.connect(item.id), item.id);
      } catch (e) {
        captureEvent({ name: "connector_error", provider: item.id, reason: connectorErrorReason(e) });
      } finally {
        setBusyFor(item.serverId, false);
      }
    },
    [host, isBlocked],
  );

  const connectDirect = useCallback(
    async (
      item: McpItem,
      opts: { mode: CredMode; clientId?: string; clientSecret?: string },
    ) => {
      if (!host.mcp?.connectDirect || isBlocked(item.id)) return;
      setBusyFor(item.serverId, true);
      dropConnectUrl(item.id);
      try {
        applyInfo(await host.mcp.connectDirect(item.id, opts), item.id);
      } catch (e) {
        captureEvent({ name: "connector_error", provider: item.id, reason: connectorErrorReason(e) });
      } finally {
        setBusyFor(item.serverId, false);
      }
    },
    [host, isBlocked, dropConnectUrl],
  );

  // Force a fresh OAuth for a connected desktop-direct account — drops the stale
  // token + re-consents (fixes a wrong-scope 403 without re-entering BYO keys).
  // Keyed by the connection INSTANCE id (a connector may have several accounts).
  const reauth = useCallback(
    async (serverId: string) => {
      if (!host.mcp?.reauthDirect) return;
      setBusyFor(serverId, true);
      dropConnectUrl(serverId);
      try {
        applyInfo(await host.mcp.reauthDirect(serverId), serverId);
      } catch (e) {
        captureEvent({ name: "connector_error", provider: serverId, reason: connectorErrorReason(e) });
      } finally {
        setBusyFor(serverId, false);
        refresh();
      }
    },
    [host, refresh, dropConnectUrl],
  );

  // Multi-account: connect an ADDITIONAL account of a desktop-direct connector.
  // Mints a fresh instance server-side; `applyInfo` folds it into the list.
  const addAccount = useCallback(
    async (item: McpItem, opts: { mode: CredMode; clientId?: string; clientSecret?: string }) => {
      if (!host.mcp?.addAccountDirect || isBlocked(item.id)) return;
      setBusyFor(item.serverId, true);
      dropConnectUrl(item.id);
      try {
        applyInfo(await host.mcp.addAccountDirect(item.id, opts), item.id);
      } catch (e) {
        captureEvent({ name: "connector_error", provider: item.id, reason: connectorErrorReason(e) });
      } finally {
        setBusyFor(item.serverId, false);
        refresh();
      }
    },
    [host, isBlocked, refresh, dropConnectUrl],
  );

  // Multi-account: connect an ADDITIONAL account of a REMOTE OAuth connector.
  // Mints a fresh instance (new login window); `applyInfo` folds it into the list.
  const addAccountRemote = useCallback(
    async (item: McpItem) => {
      if (!host.mcp?.addAccountRemote || isBlocked(item.id)) return;
      setBusyFor(item.serverId, true);
      dropConnectUrl(item.id);
      try {
        applyInfo(await host.mcp.addAccountRemote(item.id, { url: item.url }), item.id);
      } catch (e) {
        captureEvent({ name: "connector_error", provider: item.id, reason: connectorErrorReason(e) });
      } finally {
        setBusyFor(item.serverId, false);
        refresh();
      }
    },
    [host, isBlocked, refresh, dropConnectUrl],
  );

  // Multi-account: an ADDITIONAL account of a REMOTE API-key connector. The key is
  // composed EXACTLY like the first connect — into the URL query (Exa/Tavily) or
  // passed as a Bearer header (Fireflies) — then a fresh instance is minted.
  const addAccountApiKey = useCallback(
    async (item: McpItem, rawKey: string) => {
      if (!host.mcp?.addAccountRemote || isBlocked(item.id)) return;
      const help = apiKeyHelp(item.id);
      const opts =
        help && help.keyIn === "query"
          ? { url: composeApiKeyUrl(item.url ?? "", help, rawKey) }
          : { apiKey: rawKey };
      setBusyFor(item.serverId, true);
      try {
        applyInfo(await host.mcp.addAccountRemote(item.id, opts), item.id);
      } catch (e) {
        captureEvent({ name: "connector_error", provider: item.id, reason: connectorErrorReason(e) });
      } finally {
        setBusyFor(item.serverId, false);
        refresh();
      }
    },
    [host, isBlocked, refresh, dropConnectUrl],
  );

  const connectLocal = useCallback(
    async (
      item: McpItem,
      env: Record<string, string>,
      params: Record<string, string | string[]>,
    ) => {
      if (!host.mcp || isBlocked(item.id)) return;
      setBusyFor(item.serverId, true);
      try {
        const added = await host.mcp.addStdio(item.id, env, params);
        applyInfo(added.error ? added : await host.mcp.connect(item.serverId), item.id);
      } catch (e) {
        captureEvent({ name: "connector_error", provider: item.id, reason: connectorErrorReason(e) });
      } finally {
        setBusyFor(item.serverId, false);
      }
    },
    [host, isBlocked],
  );

  /**
   * Remplacer les dossiers autorisés d'un serveur local CONNECTÉ. Renvoie le message
   * d'erreur de l'hôte, ou `undefined` — la carte l'affiche telle quelle : une révocation
   * refusée doit se voir, pas disparaître.
   */
  const setDirs = useCallback(
    async (serverId: string, key: string, dirs: string[]): Promise<string | undefined> => {
      if (!host.mcp?.setDirs) return "non disponible sur cette plateforme";
      setBusyFor(serverId, true);
      try {
        const info = await host.mcp.setDirs(serverId, key, dirs);
        // `applyInfo` remplacerait l'entrée ET émettrait un `connector_connect` : ce n'est
        // pas une connexion. On rafraîchit la liste, qui porte déjà les nouveaux dossiers.
        refresh();
        return info.error;
      } catch (e) {
        return e instanceof Error ? e.message : "échec de la mise à jour";
      } finally {
        setBusyFor(serverId, false);
      }
    },
    [host, refresh],
  );

  // Cancel an in-flight interactive connect. Main tears down the OAuth loopback /
  // device window (fail-closed: no token minted). We cancel by BOTH ids the item's
  // connect could be scoped under — the connector id (remote/direct/add-account) and
  // the server id (local) — since cancelConnect is a no-op for whichever isn't running.
  const cancelConnect = useCallback(
    (item: McpItem) => {
      void host.mcp?.cancelConnect?.(item.id);
      if (item.serverId !== item.id) void host.mcp?.cancelConnect?.(item.serverId);
      // Free the UI at once; main's connect settles and its own `finally` also clears busy.
      setBusyFor(item.serverId, false);
    },
    [host],
  );

  const disconnect = useCallback(
    async (serverId: string) => {
      if (!host.mcp) return;
      setBusyFor(serverId, true);
      try {
        await host.mcp.disconnect(serverId);
        captureEvent({ name: "connector_disconnect", provider: serverId });
      } finally {
        setBusyFor(serverId, false);
        refresh();
      }
    },
    [host, refresh],
  );

  // Controllable browser: opt in (spawns the isolated agent-browser process + connects
  // @playwright/mcp) / opt out (disconnect + kill the process + clear the flag).
  const enableBrowser = useCallback(async () => {
    if (!host.mcp?.enableBrowser) return;
    setBusyFor("browser", true);
    try {
      applyInfo(await host.mcp.enableBrowser(), "browser");
    } catch (e) {
      captureEvent({ name: "connector_error", provider: "browser", reason: connectorErrorReason(e) });
    } finally {
      setBusyFor("browser", false);
      refresh();
    }
  }, [host, refresh]);

  const disableBrowser = useCallback(async () => {
    if (!host.mcp?.disableBrowser) return;
    setBusyFor("browser", true);
    try {
      await host.mcp.disableBrowser();
      captureEvent({ name: "connector_disconnect", provider: "browser" });
    } finally {
      setBusyFor("browser", false);
      refresh();
    }
  }, [host, refresh]);

  const remove = useCallback(
    async (serverId: string) => {
      if (!host.mcp) return;
      await host.mcp.remove(serverId);
      refresh();
    },
    [host, refresh],
  );

  // Adding a user-defined server is its own hook (`useAddCustomServer.ts`) — it is the
  // one path main re-validates end to end, so it stays readable on its own.
  const addCustom = useAddCustomServer({ applyInfo, refresh });

  return {
    isBlocked, servers, setServers, catalog, setCatalog, credGroups, setCredGroups,
    busy, setBusy, setBusyFor, query, setQuery, openId, setOpenId, byoId, setByoId,
    byoAdd, setByoAdd, inspecting, setInspecting, refresh, applyInfo, directConnectors,
    items, openItem, byoItem, byoConnector, filtered, groups, localItems, customItems, nothing,
    connectUrls, connectRemote, connectApiKey, connectDirect, reauth, addAccount, addAccountRemote,
    addAccountApiKey, connectLocal, setDirs, cancelConnect, disconnect, enableBrowser, disableBrowser,
    remove, addCustom,
  };
}
