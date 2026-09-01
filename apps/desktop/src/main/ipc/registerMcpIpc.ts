// The `mcp:*` channels: the connector lifecycle main owns on behalf of the renderer.
import { ipcMain } from "electron";
import type { McpToolCall } from "@openmasq/mcp";
import { getBroker } from "../broker";
import { setMcpUser, mcpList, mcpCatalog, mcpAdd, mcpAddCustom, mcpAddStdio, mcpSetStdioDirs, mcpDisconnect, mcpConnect, mcpRemove, mcpConnectDirect, mcpAddAccountDirect, mcpAddAccountRemote, mcpReauthDirect, mcpByoCredGroups, mcpEnableBrowser, mcpDisableBrowser, mcpListToolsAll, mcpCallTool } from "../mcp";
import type { CredMode } from "../mcp/credMode";
import { pickGrantDir } from "../mcp/pickGrantDir";
import { cancelConnect as mcpCancelConnect } from "../mcp/server/connectCancel";

/** Every `mcp:*` channel — the connector lifecycle the Settings → Connecteurs tab drives. */

export function registerMcpHandlers(): void {
  // Re-scope MCP integrations to the signed-in account (per-account isolation, same
  // trigger points as db:set-user). Closes the previous account's live connectors +
  // re-points MCP storage + reconnects this account's servers. `null` = signed out.
  ipcMain.handle("mcp:set-user", (_e, userId: string | null) => setMcpUser(userId));
  // MCP connectors: the main process owns the live HTTP+OAuth connections and
  // returns RAW tool data; the renderer wraps every call in the redaction vault.
  ipcMain.handle("mcp:list", () => mcpList());
  ipcMain.handle("mcp:catalog", () => mcpCatalog());
  // The local broker sidecar's URL + platforms (null until it's healthy).
  ipcMain.handle("mcp:broker", () => getBroker());
  ipcMain.handle(
    "mcp:add",
    (_e, spec: { id: string; name: string; url: string; apiKey?: string; }) =>
      // Keep the API key OFF the ServerSpec — mcpAdd stores it encrypted separately.
      mcpAdd({ id: spec.id, name: spec.name, url: spec.url, kind: "http" }, spec.apiKey)
  );
  // SECURITY: a USER-ADDED server is the one connector the app hasn't vetted, so main
  // decides everything about it — it MINTS the id (a renderer-supplied `notion` would
  // hijack that connector's spec), enforces https + no inline credentials, and runs the
  // SSRF guard before the spec is ever persisted. See `mcp/server/customSpec.ts`.
  ipcMain.handle(
    "mcp:add-custom",
    (_e, input: { name?: string; url?: string; apiKey?: string; }) => mcpAddCustom(input)
  );
  // SECURITY: renderer passes a catalog id + declared env values + granted path
  // params only — never a command. Main maps the id to the vetted command in
  // catalog.ts and re-validates every path (absolute, existing directory).
  ipcMain.handle(
    "mcp:add-stdio",
    (_e, catalogId: string, env: Record<string, string>, params?: Record<string, string>) => mcpAddStdio(catalogId, env, params)
  );
  // The native folder picker for an MCP path grant: `mcp/pickGrantDir.ts`
  // (the grant itself, the untrusted hint, and the e2e hook are documented together there).
  ipcMain.handle("mcp:pick-dir", (_e, hint: unknown) => pickGrantDir(hint));
  // Add/remove an allowed folder. The gate is the same as for an addition (a
  // new folder must come from this session's native picker).
  //
  // ⚠️ The live connection is DESTROYED before being redone, and that's not a detail:
  // `connectServer` short-circuits on a connector already connected (`connected.has(id)` →
  // it refreshes the routes and returns), and the filesystem worker receives its roots
  // via `FS_ROOTS` AT FORK TIME, once only. A plain `mcpConnect` therefore left the
  // old perimeter in place: the added folder stayed unreachable for the model until the
  // app restarted.
  ipcMain.handle("mcp:set-dirs", (_e, id: string, key: string, dirs: string[]) => mcpSetStdioDirs(id, key, Array.isArray(dirs) ? dirs.map(String) : [], async (sid) => {
    await mcpDisconnect(sid);
    return mcpConnect(sid);
  })
  );
  ipcMain.handle("mcp:remove", (_e, id: string) => mcpRemove(id));
  ipcMain.handle("mcp:connect", (_e, id: string) => mcpConnect(id));
  ipcMain.handle(
    "mcp:connect-direct",
    (_e, id: string, opts: { mode: CredMode; clientId?: string; }) => mcpConnectDirect(id, opts)
  );
  ipcMain.handle(
    "mcp:add-account-direct",
    (_e, id: string, opts: { mode: CredMode; clientId?: string; clientSecret?: string; }) => mcpAddAccountDirect(id, opts)
  );
  ipcMain.handle(
    "mcp:add-account-remote",
    (_e, id: string, opts: { url?: string; name?: string; apiKey?: string; }) => mcpAddAccountRemote(id, opts)
  );
  ipcMain.handle("mcp:reauth-direct", (_e, id: string) => mcpReauthDirect(id));
  ipcMain.handle("mcp:byo-cred-groups", () => mcpByoCredGroups());
  // Cancel an in-flight interactive connect ("Annuler" on the "Connexion…" state):
  // main tears down the OAuth loopback / device window so no token is minted.
  ipcMain.handle("mcp:cancel-connect", (_e, id: string) => mcpCancelConnect(id));
  ipcMain.handle("mcp:disconnect", (_e, id: string) => mcpDisconnect(id));
  // Controllable-browser connector: opt in (persist flag + spec, connect if the CDP
  // endpoint is already open) / opt out (disconnect + clear flag).
  ipcMain.handle("mcp:enable-browser", () => mcpEnableBrowser());
  ipcMain.handle("mcp:disable-browser", () => mcpDisableBrowser());
  ipcMain.handle("mcp:list-tools", () => mcpListToolsAll());
  // Write gating is MAIN-OWNED (`mcp/server/callTool.ts` applies the org-composed
  // CONFIRMATION_POLICY on main's un-spoofable window). The old renderer-minted
  // `mcp:approve-write` token was a fail-open — a renderer XSS could self-approve —
  // and its channel is removed end to end, not just ignored.
  ipcMain.handle("mcp:call-tool", (_e, call: McpToolCall) => mcpCallTool(call));
}
