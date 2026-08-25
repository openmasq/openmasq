import { ipcRenderer } from "electron";
import type { McpTool, McpToolCall, McpToolResult } from "@openmasq/mcp";
import type { McpServerInfo, McpCatalogEntry, McpBrokerInfo } from "../types";

/** MCP connectors (remote tools over HTTP+OAuth). The main process owns the
 *  live connections and returns RAW data; the renderer adds redaction. */
export const mcp = {
  list: (): Promise<McpServerInfo[]> => ipcRenderer.invoke("mcp:list"),
  catalog: (): Promise<McpCatalogEntry[]> => ipcRenderer.invoke("mcp:catalog"),
  broker: (): Promise<McpBrokerInfo | null> => ipcRenderer.invoke("mcp:broker"),
  add: (spec: { id: string; name: string; url: string; apiKey?: string }): Promise<void> =>
    ipcRenderer.invoke("mcp:add", spec),
  /** Add a USER-DEFINED remote server. Main mints the id and validates the endpoint;
   *  a refusal comes back as `error` on the info, never as a thrown string. */
  addCustom: (input: {
    name: string;
    url: string;
    apiKey?: string;
  }): Promise<McpServerInfo> => ipcRenderer.invoke("mcp:add-custom", input),
  addStdio: (
    catalogId: string,
    env: Record<string, string>,
    params?: Record<string, string | string[]>,
  ): Promise<McpServerInfo> =>
    ipcRenderer.invoke("mcp:add-stdio", catalogId, env, params),
  /** `hint` only pre-positions the native dialog (a dropped folder). It grants
   *  nothing — the grant is what the dialog RETURNS. */
  pickDir: (hint?: string): Promise<string | undefined> =>
    ipcRenderer.invoke("mcp:pick-dir", hint),
  setDirs: (id: string, key: string, dirs: string[]) =>
    ipcRenderer.invoke("mcp:set-dirs", id, key, dirs),
  remove: (id: string): Promise<void> => ipcRenderer.invoke("mcp:remove", id),
  connect: (id: string): Promise<McpServerInfo> =>
    ipcRenderer.invoke("mcp:connect", id),
  connectDirect: (
    id: string,
    opts: { mode: string; clientId?: string; clientSecret?: string },
  ): Promise<McpServerInfo> => ipcRenderer.invoke("mcp:connect-direct", id, opts),
  addAccountDirect: (
    id: string,
    opts: { mode: string; clientId?: string; clientSecret?: string },
  ): Promise<McpServerInfo> => ipcRenderer.invoke("mcp:add-account-direct", id, opts),
  addAccountRemote: (
    id: string,
    opts: { url?: string; name?: string; apiKey?: string },
  ): Promise<McpServerInfo> => ipcRenderer.invoke("mcp:add-account-remote", id, opts),
  reauthDirect: (id: string): Promise<McpServerInfo> =>
    ipcRenderer.invoke("mcp:reauth-direct", id),
  byoCredGroups: (): Promise<string[]> => ipcRenderer.invoke("mcp:byo-cred-groups"),
  cancelConnect: (id: string): Promise<void> =>
    ipcRenderer.invoke("mcp:cancel-connect", id),
  disconnect: (id: string): Promise<void> =>
    ipcRenderer.invoke("mcp:disconnect", id),
  enableBrowser: (): Promise<McpServerInfo> => ipcRenderer.invoke("mcp:enable-browser"),
  disableBrowser: (): Promise<void> => ipcRenderer.invoke("mcp:disable-browser"),
  listTools: (): Promise<McpTool[]> => ipcRenderer.invoke("mcp:list-tools"),
  callTool: (call: McpToolCall): Promise<McpToolResult> =>
    ipcRenderer.invoke("mcp:call-tool", call),
  /** Re-scope MCP integrations to the signed-in account (per-account isolation). The
   *  renderer calls this on sign-in / account switch / sign-out, alongside db.setUser. */
  setUser: (userId: string | null): Promise<void> =>
    ipcRenderer.invoke("mcp:set-user", userId),
  /** Arm/disarm session write auto-approve. Enabling is confirmed on the main-owned window
   *  (the renderer cannot self-grant it); resolves to the RESULTING state. */
  setWriteAutoApprove: (enable: boolean): Promise<boolean> =>
    ipcRenderer.invoke("mcp:set-write-auto-approve", enable),
  /** Confirmation MODE (standard | renforce), main-owned + persisted. Downgrading to
   *  standard is confirmed on the main-owned window; resolves to the RESULTING mode. */
  setConfirmationMode: (mode: "standard" | "renforce"): Promise<"standard" | "renforce"> =>
    ipcRenderer.invoke("mcp:set-confirmation-mode", mode),
  getConfirmationMode: (): Promise<"standard" | "renforce"> =>
    ipcRenderer.invoke("mcp:get-confirmation-mode"),
  /** Publish the ORG's confirmation floor. Write-only and one-directional: main composes
   *  it with the member's own mode by taking the STRICTER, so this can only ever add
   *  confirmations — which is what makes an unverified, renderer-supplied floor safe. */
  setOrgConfirmationFloor: (floor: "standard" | "renforce" | null): Promise<void> =>
    ipcRenderer.invoke("mcp:set-org-confirmation-floor", floor),
  /** Publish the ORG's blocked-connector ids so main enforces them too (the renderer's
   *  own tool filter is UX — it misses a custom-server re-add and a direct call). */
  setOrgAllowedConnectors: (ids: string[] | null): Promise<void> =>
    ipcRenderer.invoke("mcp:set-org-allowed-connectors", ids),
  /** Live state changed in main (connect/disconnect/silent reconnect) — the
   *  renderer should re-fetch `list()`. Returns an unsubscribe fn. */
  onChanged: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on("mcp:changed", handler);
    return () => ipcRenderer.removeListener("mcp:changed", handler);
  },
  /** Connectors that dropped unexpectedly (backend closed the transport) and need a
   *  manual reconnect. Emits the current full list on each change ([] when healthy). */
  onNeedsReconnect: (cb: (items: { id: string; name: string }[]) => void): (() => void) => {
    const handler = (_: unknown, items: { id: string; name: string }[]) => cb(items);
    ipcRenderer.on("mcp:needs-reconnect", handler);
    return () => ipcRenderer.removeListener("mcp:needs-reconnect", handler);
  },
  /** The OAuth authorize URL of an in-flight interactive connect (id → url), so the UI
   *  can offer "Copier le lien" to open the login in another browser. Returns unsubscribe. */
  onOauthUrl: (cb: (e: { id: string; url: string }) => void): (() => void) => {
    const handler = (_: unknown, e: { id: string; url: string }) => cb(e);
    ipcRenderer.on("mcp:oauth-url", handler);
    return () => ipcRenderer.removeListener("mcp:oauth-url", handler);
  },
  /** Main asks (dual-mode connector: Firecrawl…) whether to connect with the
   *  user's account or anonymously. The renderer shows a styled modal; we relay
   *  its answer back on the request-scoped reply channel. Returns an unsubscribe fn. */
  onAuthChoice: (
    handler: (req: { id: string; name: string }) => Promise<"account" | "anonymous">,
  ): (() => void) => {
    const listener = (
      _e: unknown,
      req: { requestId: string; id: string; name: string },
    ): void => {
      Promise.resolve(handler({ id: req.id, name: req.name }))
        .catch(() => "anonymous" as const)
        .then((choice) => ipcRenderer.send(`mcp:auth-choice-reply:${req.requestId}`, choice));
    };
    ipcRenderer.on("mcp:auth-choice", listener);
    return () => ipcRenderer.removeListener("mcp:auth-choice", listener);
  },
};
