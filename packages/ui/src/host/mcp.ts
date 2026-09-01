import type { McpTool, McpToolCall, McpToolResult } from "@openmasq/mcp";
import { BRAND } from "@openmasq/branding";

/** Credential mode of a desktop-direct connector: the app's own public OAuth client
 *  (persisted under the brand slug — `MANAGED_CRED_MODE`) or the user's own ("byo").
 *  The managed mode's value is a PERSISTED wire value (it lives in stored specs), so it
 *  derives from `@openmasq/branding` and cannot be a type literal here. */
export type CredMode = "byo" | (string & {});
/** The managed credential mode as persisted/sent to the platform: the brand slug. */
export const MANAGED_CRED_MODE: CredMode = BRAND.slug;

/** One configured MCP "connector" server and its live state. */
export interface McpServerInfo {
  id: string;
  name: string;
  url: string;
  /** "http" = remote connector (OAuth); "stdio" = local catalog server;
   *  "local-oauth" = desktop-direct connector (OAuth on-device, tools in-process);
   *  "browser" = the controllable-browser connector (@playwright/mcp over CDP). */
  kind: "http" | "stdio" | "local-oauth" | "browser";
  connected: boolean;
  authorized: boolean;
  toolCount?: number;
  error?: string;
  /** The catalog connector this instance is an account of (multi-account, direct
   *  connectors). Equals `id` for a first/only account. */
  connectorId?: string;
  /** Human account label (email / "Compte N") for a multi-account instance. */
  label?: string;
  /** desktop-direct (local-oauth): which credentials it's configured to use. */
  credMode?: CredMode;
  /** Local server: the authorized folders, by param key. These are the user's
   *  folders, not a secret — the card displays and edits them. */
  params?: Record<string, string[]>;
  /** desktop-direct + `byo`: the user's own client id/secret are already stored on
   *  this machine (the secret is never surfaced) — lets "Mes clés" say so + reuse. */
  hasCreds?: boolean;
}

export interface McpEnvField {
  key: string;
  label: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
}

/** The local broker sidecar's URL + the platforms it currently exposes. */
export interface McpBrokerInfo {
  url: string;
  platforms: { id: string; name: string; desc: string; mcpUrl: string }[];
}

/** A user-granted path (e.g. the filesystem server's allowed root). */
export interface McpParamField {
  key: string;
  label: string;
  kind: "directory";
  required?: boolean;
  /** Accept several grants (e.g. multiple allowed folders). */
  multiple?: boolean;
}

/** A local (stdio) server installable from the vetted catalog (no command editing). */
export interface McpCatalogEntry {
  id: string;
  name: string;
  desc: string;
  tone: string;
  /** Display-only command line (immutable; runs only what the catalog declares).
   *  Empty for an `inProcess` entry (no external command is run). */
  commandLine: string;
  /** Runs in-process inside the app (no spawned command) — the UI shows an
   *  "intégré à l'app" note instead of a shell line. */
  inProcess?: boolean;
  env: McpEnvField[];
  /** Path grants (validated in main) — e.g. the filesystem allowed root. */
  params?: McpParamField[];
  note?: string;
  setupUrl?: string;
}

/**
 * Optional MCP capability. Two server kinds:
 *  - **http** — remote "connector" servers (Notion, Slack, …) over HTTP+OAuth.
 *  - **stdio** — local servers from a vetted catalog (Gmail, Slack, GitHub), each
 *    spawned by main with credentials supplied as encrypted env values.
 * The main process owns the real connections and returns RAW (real) tool data; the
 * renderer wraps every call in the conversation's redaction vault, so the model
 * only ever sees placeholders.
 */
export interface McpHost {
  /** True when the PLATFORM enforces its own un-spoofable write-confirmation surface
   *  (desktop main's window) for every mutating non-browser tool. The renderer then
   *  SKIPS its inline card for a plain write — one confirmation instead of two. The
   *  exfil / navigation / attachments cards stay renderer-side regardless (they carry
   *  privacy signals the platform gate doesn't show). Absent = no platform gate ⇒ the
   *  inline card is the only confirmation and always shows. */
  mainWriteGate?: boolean;
  list(): Promise<McpServerInfo[]>;
  /** The vetted local-server catalog (for the "local servers" section of the UI). */
  catalog(): Promise<McpCatalogEntry[]>;
  /** The local broker sidecar's URL + platforms, or null when it isn't running. */
  broker(): Promise<McpBrokerInfo | null>;
  /** `apiKey` = a Bearer key for a header-auth remote connector (e.g. Fireflies);
   *  the desktop stores it encrypted. Absent for OAuth / query-param connectors. */
  add(spec: { id: string; name: string; url: string; apiKey?: string }): Promise<void>;
  /** Add a USER-DEFINED remote MCP server — a host the app has NOT vetted, so the
   *  platform decides everything about it: it MINTS the id (never trust one from here),
   *  requires https with no inline credentials, and SSRF-guards the endpoint before
   *  persisting it. A refusal comes back as `error` on the returned info (with an empty
   *  `id`), never as a throw, so the form can show it inline.
   *  Optional — absent ⇒ the UI shows no "Ajouter un serveur" affordance at all
   *  (a platform that cannot validate the endpoint must not offer to add one). */
  addCustom?(input: { name: string; url: string; apiKey?: string }): Promise<McpServerInfo>;
  /** Install a local server from the catalog with its declared env + path grants. */
  addStdio(
    catalogId: string,
    env: Record<string, string>,
    params?: Record<string, string | string[]>,
  ): Promise<McpServerInfo>;
  /** Native directory picker for a path-grant param; resolves the absolute path. */
  /** `hint` pre-positions the native dialog on a folder the user dropped. It is a HINT
   *  and nothing else: the authorisation is what the dialog returns, so a wrong hint
   *  costs a mis-placed picker and never a grant. */
  pickDir(hint?: string): Promise<string | undefined>;
  /** Replace the authorized folders of an ALREADY connected local server (add/remove),
   *  without disconnecting it. A NEW folder must come from `pickDir` (the host verifies
   *  it, on the privileged side); the live connection is rebuilt behind it, so a removal
   *  takes effect right away. Absent ⇒ the UI doesn't offer editing. */
  setDirs?(id: string, key: string, dirs: string[]): Promise<McpServerInfo>;
  remove(id: string): Promise<void>;
  /** Connect — opens OAuth in a browser (http) or spawns the server (stdio). */
  connect(id: string): Promise<McpServerInfo>;
  /** Connect a DESKTOP-DIRECT connector (github): OAuth on-device (device flow /
   *  loopback+PKCE), tools run in-process — no broker. `mode` picks the app's own
   *  public client (`MANAGED_CRED_MODE`, limited scopes) vs the user's own ("byo");
   *  `clientId` is the user's PUBLIC client id in byo mode (never a secret). */
  connectDirect?(
    id: string,
    opts: { mode: CredMode; clientId?: string; clientSecret?: string },
  ): Promise<McpServerInfo>;
  /** Connect an ADDITIONAL account of a desktop-direct connector (multi-account):
   *  mints a fresh instance so its token + tools live alongside the existing
   *  account(s). `id` is the connector id; the new instance is labelled with the
   *  signed-in account (email / login), falling back to "Compte N". */
  addAccountDirect?(
    id: string,
    opts: { mode: CredMode; clientId?: string; clientSecret?: string },
  ): Promise<McpServerInfo>;
  /** Connect an ADDITIONAL account of a REMOTE connector (multi-account): mints a
   *  fresh instance and connects it. `url` defaults to the preset/primary URL; an
   *  OAuth preset opens a new login window, an API-key connector takes a new key
   *  (`apiKey` = header key, or a query-param key already baked into `url`). */
  addAccountRemote?(
    id: string,
    opts: { url?: string; name?: string; apiKey?: string },
  ): Promise<McpServerInfo>;
  /** Force a FRESH OAuth for a connected desktop-direct connector — drops the
   *  stored token (keeps the BYO creds) and re-runs the login with fresh consent,
   *  so a stale / wrong-scope token (→ 403) is replaced. */
  reauthDirect?(id: string): Promise<McpServerInfo>;
  /** BYO credential groups that already have keys stored (e.g. ["google"]) — Google
   *  connectors share ONE OAuth client, so entering the keys for one lets the others
   *  reuse them. The UI shows "déjà enregistré" on a group whose keys exist. */
  byoCredGroups?(): Promise<string[]>;
  /** Cancel an IN-FLIGHT interactive connect (the "Connexion…" state). Main tears
   *  down the OAuth loopback (closing the 127.0.0.1 listener so no `code` can land and
   *  no token is minted), the GitHub device window, and the handshake; the pending
   *  `connect*` call then rejects/returns an error and nothing is left connected
   *  (fail-closed). `id` is the same id passed to `connect`/`connectDirect`/
   *  `addAccount*` (the renderer may safely call it for both the connector id and the
   *  server id — a no-op when neither is connecting). Optional — absent ⇒ the UI can't
   *  offer a cancel and the spinner simply runs to completion/timeout. */
  cancelConnect?(id: string): Promise<void>;
  disconnect(id: string): Promise<void>;
  /** Enable the controllable-browser connector: opts into driving Electron's own
   *  Chromium via @playwright/mcp over CDP. Persists the opt-in + a `browser` spec;
   *  connects if the CDP endpoint is already open, else the returned info carries
   *  `error === "BROWSER_RESTART_REQUIRED"` (the endpoint opens once at startup, so
   *  a fresh opt-in needs a relaunch). Optional — desktop only. */
  enableBrowser?(): Promise<McpServerInfo>;
  /** Disable + remove the controllable-browser connector (clears the opt-in). */
  disableBrowser?(): Promise<void>;
  /** Re-scope MCP integrations to the signed-in account (per-account isolation): closes
   *  the previous account's live connectors, re-points MCP storage, reconnects this
   *  account's. Called on sign-in / account switch / sign-out (alongside `db.setUser`);
   *  `null` = signed out. Optional — absent on platforms without per-account MCP. */
  setUser?(userId: string | null): Promise<void>;
  /** Tools across all connected servers, names namespaced `${serverId}__${tool}`. */
  listTools(): Promise<McpTool[]>;
  /** Run a tool with RAW real data (the renderer adds redaction). Write gating is
   *  MAIN-OWNED: a renderer-supplied approval can never influence it (the old
   *  renderer-minted token was a fail-open — a renderer XSS could self-approve —
   *  and its wiring is removed end to end; main applies `CONFIRMATION_POLICY` on
   *  its own un-spoofable window). */
  callTool(call: McpToolCall): Promise<McpToolResult>;
  /** Arm (`true`) / disarm (`false`) SESSION write auto-approve: skip the per-action
   *  confirmation for mutating tools until the app restarts. SECURITY — enabling is
   *  confirmed on main's un-spoofable window (the renderer cannot self-grant it), so this
   *  is a user choice, not a renderer bypass; resolves to the RESULTING state (a refused
   *  enable stays protected). Absent (browser preview / un-restarted preload) ⇒ the toggle
   *  hides and every write keeps prompting (fail-closed). */
  setWriteAutoApprove?(enable: boolean): Promise<boolean>;
  /** The confirmation MODE (`standard` | `renforce`) feeding `CONFIRMATION_POLICY`
   *  (`@openmasq/catalog/mcp`). MAIN owns and persists it — the renderer only mirrors
   *  the returned state for its own card decisions. Downgrading renforce→standard is
   *  confirmed on main's un-spoofable window (a renderer XSS can't lower the posture);
   *  resolves to the RESULTING mode. Absent (browser preview / un-restarted preload) ⇒
   *  the Réglages toggle hides and the renderer evaluates the `standard` policy, whose
   *  system-modal-less rules never defer to a window that doesn't exist. */
  setConfirmationMode?(mode: "standard" | "renforce"): Promise<"standard" | "renforce">;
  /** Read the persisted mode at boot so the renderer mirror starts true. */
  getConfirmationMode?(): Promise<"standard" | "renforce">;
  /** Publish the ORGANISATION's confirmation floor to the platform. Write-only, and safe
   *  to hand over unverified: the platform composes it with the member's own mode by
   *  taking the STRICTER, so a wrong value can only add confirmations. `null` clears it. */
  setOrgConfirmationFloor?(floor: "standard" | "renforce" | null): Promise<void>;
  /** Publish the ORGANISATION's ALLOWED connector ids to the platform, so the policy is
   *  enforced where the renderer cannot be trusted to. ⚠️ `null` and `[]` are DIFFERENT
   *  and both are meaningful: `null` = no organisation / policy not known yet, and the
   *  platform leaves the gate open; `[]` = a managed account whose org opened nothing,
   *  and the gate CLOSES. Defence in depth, not a proof — main cannot verify the list. */
  setOrgAllowedConnectors?(ids: string[] | null): Promise<void>;
  /** The account's integrations connected on OTHER devices (the E2E-synced
   *  DIRECTORY — config only, never a credential/url): drives the Réglages
   *  "Connecter sur cet appareil" section. Structurally `SyncedIntegration`
   *  from `@openmasq/sync` (the desktop assembly typechecks the parity).
   *  Optional — absent on platforms without record sync. */
  syncedIntegrations?(): Promise<
    { id: string; connectorId: string; name: string; kind: string; label?: string }[]
  >;
  /** Subscribe to live connection-state changes (connect/disconnect and the
   *  SILENT startup reconnect, which completes after the UI's first `list()`) so
   *  the UI can re-fetch instead of showing a reconnected server as disconnected.
   *  Returns an unsubscribe fn. Optional — absent on platforms without a bridge. */
  onChanged?(cb: () => void): () => void;
  /** Subscribe to remote connectors that DROPPED unexpectedly (their backend closed the
   *  connection) and need a manual reconnect. Emits the CURRENT full list on each change
   *  ([] when all healthy). Powers the app's bottom "reconnexion nécessaire" banner.
   *  Returns an unsubscribe fn. Optional — absent on platforms without a bridge. */
  onNeedsReconnect?(cb: (items: { id: string; name: string }[]) => void): () => void;
  /** Subscribe to the OAuth authorize URL of an in-flight interactive connect (id → url),
   *  so the UI can offer "Copier le lien" — the login then completes in whatever browser the
   *  user opens (the return path is browser-agnostic). The URL is the PUBLIC authorize URL
   *  that already goes to the system browser (no secret). Returns an unsubscribe fn. Optional
   *  — absent ⇒ no copy affordance (the default browser still opens). */
  onOauthUrl?(cb: (e: { id: string; url: string }) => void): () => void;
  /** Connecting a connector that allows BOTH signed-in and anonymous access
   *  (Firecrawl…) asks the user which to use: their own account (real credits/
   *  quotas/scope) or anonymous limited access. Main calls this so the UI can show
   *  a styled in-app modal (instead of a native OS popup) and await the choice;
   *  the handler resolves "account" | "anonymous" ("anonymous" = the safe default
   *  when dismissed). Returns an unsubscribe fn. Optional — absent in the browser
   *  preview, where main falls back to anonymous. */
  onAuthChoice?(
    handler: (req: { id: string; name: string }) => Promise<"account" | "anonymous">,
  ): () => void;
}
