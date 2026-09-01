import { app, safeStorage } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { StoredOAuthState } from "@openmasq/mcp/transport"; import { BRAND } from "@openmasq/branding"; import type { CredMode } from "./credMode";
import { encryptionAvailable } from "../store/safeStore";
import { withCatalogUrl } from "./presetUrl";
import { assertPlaintextAllowed } from "../store/atRestPolicy";

/**
 * Durable storage for MCP connectors, in `${userData}/mcp.json`. Server specs are
 * plain; each server's OAuth state (registered client, tokens, PKCE verifier) is
 * encrypted with Electron `safeStorage` (OS keychain) and stored base64. Falls
 * back to base64 plaintext with a warning when encryption is unavailable.
 */
export interface ServerSpec {
  /** The connection INSTANCE id. For the first/only account of a connector this IS
   *  the catalog connector id; ADDITIONAL accounts (multi-account, direct connectors)
   *  are stored as `${connectorId}--${suffix}`. Tokens/oauth/etc. are all keyed by
   *  this id, so two accounts of the same connector never collide. */
  id: string;
  name: string;
  /** The catalog connector id this instance is an account OF (multi-account). Absent
   *  ⇒ this spec's `id` IS the connector id (the first/only account). */
  connectorId?: string;
  /** Human account label (email / "Compte N") shown in the UI + injected into the
   *  connector's tool descriptions so the model can pick the right account. */
  label?: string;
  /** STABLE per-account identity (Gmail email / GitHub login / Dropbox account_id…),
   *  used to DEDUPE — adding an account that resolves to an already-connected one is
   *  refused. Best-effort: absent when the provider has no cheap identity endpoint. */
  accountKey?: string;
  /** "http" = remote connector (OAuth); "stdio" = local catalog server;
   *  "local-oauth" = desktop-direct connector (OAuth on-device, tools in-process);
   *  "browser" = the controllable-browser connector (@playwright/mcp over CDP). */
  kind?: "http" | "stdio" | "local-oauth" | "browser";
  /** Remote endpoint (http servers). */
  url?: string;
  /** Catalog entry id (stdio servers) — the vetted command lives in catalog.ts. */
  catalogId?: string;
  /** User-granted path params (stdio servers), e.g. the filesystem allowed
   *  folders. A value is a single path, or several for a `multiple` grant. */
  params?: Record<string, string | string[]>;
  /** Credential mode (local-oauth): the app's own public client vs the user's. */
  credMode?: CredMode;
  /** OAuth client id for a `byo` local-oauth connector (public — not a secret;
   *  the built-in mode reads its id from env). */
  clientId?: string;
  /** OAuth client secret for a `byo` local-oauth connector that needs one
   *  (Google "Desktop app" clients ship a NON-confidential secret; PKCE is the
   *  real protection). Absent for device-flow connectors (GitHub) which have none.
   *  The built-in mode reads its secret from env. */
  clientSecret?: string;
}

/**
 * A stored OAuth token for a desktop-direct connector. `refreshToken`/`expiresAt`
 * are only set for OAuth2-with-refresh providers (Google); a device-flow token
 * (GitHub) is access-only and never expires, so it stores just `accessToken`.
 */
export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when `accessToken` expires (Google); absent = no known expiry. */
  expiresAt?: number;
  /** The scopes the server actually GRANTED (its token response's `scope`), which
   *  is not always what we asked for — granular consent lets the user untick one.
   *  Drives the tool-listing filter via `connectors/scopes.ts` `effectiveScopes`.
   *  Absent for a connection stored before this was captured, and for the flows
   *  that never report it (Slack relay, GitHub device) → the requested list is
   *  used instead. */
  scopes?: string[];
}

interface Raw {
  servers: ServerSpec[];
  /** id → encrypted StoredOAuthState (http servers). */
  oauth: Record<string, string>;
  /** id → encrypted env values (stdio servers). */
  secrets: Record<string, string>;
  /** id → loopback redirect port (http servers). Plain: not a secret, and it
   *  must stay stable so the registered OAuth redirect URI keeps matching. */
  ports?: Record<string, number>;
  /** id → encrypted access token (local-oauth desktop-direct connectors). */
  tokens?: Record<string, string>;
  /** id → encrypted API key (header-auth remote connectors, e.g. Fireflies). */
  apiKeys?: Record<string, string>;
}

/**
 * PER-ACCOUNT storage (privacy isolation, mirrors the per-account DB in `main/db.ts`).
 * The MCP store is NOT one shared file — it is scoped to the signed-in account at
 * `${userData}/accounts/mcp-<uid>.json` via {@link setPersistUser}, so a shared machine
 * never leaves one account's connected integrations (and their OAuth tokens) usable by
 * another. Signed out (`null`) ⇒ an in-memory empty store that is NEVER written to disk.
 */
let currentUserId: string | null = null;
let cache: Raw | null = null;

/**
 * SECURITY (audit M10 — path traversal): `uid` comes from the RENDERER (`mcp:set-user`) and
 * is interpolated into `mcp-<uid>.json`, so a crafted value could escape `accounts/`.
 * Sanitize to `[A-Za-z0-9_-]` (same as `keys.ts` `safeUid` / `db.ts` `setDbUser`).
 */
const safeUid = (uid: string) => uid.replace(/[^a-zA-Z0-9_-]/g, "");
const accountFile = (uid: string) => join(app.getPath("userData"), "accounts", `mcp-${safeUid(uid)}.json`);
const legacyFile = () => join(app.getPath("userData"), "mcp.json");
const adoptMarker = () => join(app.getPath("userData"), `.${BRAND.slug}-legacy-mcp-adopted`);

/** This account's store path, or null when signed out (memory-only, never persisted). */
const file = (): string | null => (currentUserId ? accountFile(currentUserId) : null);

const emptyRaw = (): Raw => ({
  servers: [],
  oauth: {},
  secrets: {},
  ports: {},
  tokens: {},
  apiKeys: {},
});

function read(): Raw {
  if (cache) return cache;
  const path = file();
  try {
    if (!path) throw new Error("signed out — memory-only store");
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Raw>;
    cache = {
      servers: parsed.servers ?? [],
      oauth: parsed.oauth ?? {},
      secrets: parsed.secrets ?? {},
      ports: parsed.ports ?? {},
      tokens: parsed.tokens ?? {},
      apiKeys: parsed.apiKeys ?? {},
    };
  } catch {
    cache = emptyRaw();
  }
  return cache;
}

function write(r: Raw): void {
  cache = r;
  const path = file();
  if (!path) return; // signed out — keep it in memory, never write tokens to disk
  try {
    mkdirSync(dirname(path), { recursive: true });
    // 0600 like keys.enc — owner-only. The contents are safeStorage-encrypted, but a
    // restrictive mode is cheap defence-in-depth (esp. the plaintext-fallback case).
    writeFileSync(path, JSON.stringify(r, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error("[mcp] failed to write mcp.json:", err);
  }
}

/**
 * Re-point the MCP store at THIS account's file (or a memory-only store when signed out)
 * and drop the in-memory cache so the next read hydrates the new scope. The FIRST account
 * to sign in after this per-account upgrade ADOPTS the legacy shared `mcp.json` ONCE
 * (marker-gated), so existing users keep their connectors and no OTHER account inherits
 * them. Callers must close live connections BEFORE this (see `mcp/index.ts setMcpUser`).
 */
export function setPersistUser(userId: string | null): void {
  // Sanitize before it reaches a path (audit M10); an all-illegal uid ⇒ signed-out (fail closed).
  const safe = userId == null ? null : safeUid(userId) || null;
  if (safe) maybeAdoptLegacy(safe);
  currentUserId = safe;
  cache = null;
}

/** One-time: copy the pre-isolation shared `mcp.json` into the first signing-in account,
 *  then mark it claimed so no one else inherits it (mirrors `maybeAdoptLegacyDb`). */
function maybeAdoptLegacy(userId: string): void {
  try {
    const dest = accountFile(userId);
    if (existsSync(dest) || existsSync(adoptMarker()) || !existsSync(legacyFile())) return;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(legacyFile(), dest);
    writeFileSync(adoptMarker(), "adopted");
  } catch (err) {
    console.error("[mcp] legacy store adoption failed:", err);
  }
}

// A catalog preset's endpoint URL is refreshed from the catalog on every read — a vendor
// that moves its endpoint would otherwise leave every ALREADY-connected user on the dead
// one (see `presetUrl.ts`). User-added servers are untouched.
export function listServers(): ServerSpec[] {
  return read().servers.map(withCatalogUrl);
}

export function getServer(id: string): ServerSpec | undefined {
  const spec = read().servers.find((s) => s.id === id);
  return spec && withCatalogUrl(spec);
}

export function addServer(spec: ServerSpec): void {
  const r = read();
  write({ ...r, servers: [...r.servers.filter((s) => s.id !== spec.id), spec] });
}

export function removeServer(id: string): void {
  const r = read();
  const oauth = { ...r.oauth };
  const secrets = { ...r.secrets };
  const ports = { ...(r.ports ?? {}) };
  const tokens = { ...(r.tokens ?? {}) };
  const apiKeys = { ...(r.apiKeys ?? {}) };
  delete oauth[id];
  delete secrets[id];
  delete ports[id];
  delete tokens[id];
  delete apiKeys[id];
  write({ servers: r.servers.filter((s) => s.id !== id), oauth, secrets, ports, tokens, apiKeys });
}

/** Encrypt a JSON-serialisable value to base64 (OS keychain via safeStorage). */
function encrypt(value: unknown): string {
  const json = JSON.stringify(value);
  if (encryptionAvailable()) {
    return safeStorage.encryptString(json).toString("base64");
  }
  assertPlaintextAllowed("MCP connector credentials");
  console.warn("[mcp] safeStorage unavailable — storing credentials unencrypted");
  return Buffer.from(json, "utf8").toString("base64");
}

function decrypt<T>(enc: string | undefined, label: string, onCorrupt?: () => void): T | undefined {
  if (!enc) return undefined;
  const keychain = encryptionAvailable();
  try {
    const buf = Buffer.from(enc, "base64");
    const json = keychain ? safeStorage.decryptString(buf) : buf.toString("utf8");
    return JSON.parse(json) as T;
  } catch (err) {
    // (a) Recover a PLAINTEXT-FALLBACK entry: it was written as base64(JSON) while the
    //     keychain was unavailable, and a later launch WITH a keychain tries
    //     `decryptString` on it and throws. Parse it as plaintext base64-JSON before
    //     giving up — and NEVER drop it (it's perfectly readable, just not encrypted).
    try {
      return JSON.parse(Buffer.from(enc, "base64").toString("utf8")) as T;
    } catch {
      /* not plaintext JSON either — fall through */
    }
    // (b) Only DROP when the keychain IS available and the ciphertext still won't
    //     decrypt — a real key↔ciphertext mismatch (orphaned by a keychain rotation),
    //     genuinely unreadable. When the keychain is UNAVAILABLE (a transient/memoized
    //     miss), KEEP the entry and skip it this session — matching dbCrypto's
    //     non-destructive stance; the "needs reconnect" state drives recovery. Dropping
    //     on a transient miss silently destroyed credentials (audit M-8).
    console.warn(`[mcp] unreadable ${label}: ${err instanceof Error ? err.message : String(err)}`);
    if (keychain) onCorrupt?.();
    return undefined;
  }
}

/** Remove a permanently-unreadable encrypted entry from a store section (a keychain
 *  change orphaned its ciphertext) so it stops failing to decrypt on every reconnect. */
function dropStored(section: "oauth" | "secrets" | "tokens" | "apiKeys", id: string): void {
  const r = read();
  if (section === "oauth") {
    const oauth = { ...r.oauth };
    delete oauth[id];
    write({ ...r, oauth });
  } else if (section === "secrets") {
    const secrets = { ...r.secrets };
    delete secrets[id];
    write({ ...r, secrets });
  } else if (section === "tokens") {
    const tokens = { ...(r.tokens ?? {}) };
    delete tokens[id];
    write({ ...r, tokens });
  } else {
    const apiKeys = { ...(r.apiKeys ?? {}) };
    delete apiKeys[id];
    write({ ...r, apiKeys });
  }
}

export function loadOAuth(id: string): StoredOAuthState | undefined {
  return decrypt<StoredOAuthState>(read().oauth[id], `OAuth state for '${id}'`, () =>
    dropStored("oauth", id),
  );
}

export function saveOAuth(id: string, state: StoredOAuthState): void {
  const r = read();
  write({ ...r, oauth: { ...r.oauth, [id]: encrypt(state) } });
}

/** The persisted loopback port for an http connector (stable redirect URI). */
export function loadPort(id: string): number | undefined {
  return read().ports?.[id];
}

export function savePort(id: string, port: number): void {
  const r = read();
  write({ ...r, ports: { ...(r.ports ?? {}), [id]: port } });
}

/** Decrypted env values for a stdio server (secret tokens). */
export function loadSecrets(id: string): Record<string, string> {
  return (
    decrypt<Record<string, string>>(read().secrets[id], `secrets for '${id}'`, () =>
      dropStored("secrets", id),
    ) ?? {}
  );
}

export function saveSecrets(id: string, env: Record<string, string>): void {
  const r = read();
  write({ ...r, secrets: { ...r.secrets, [id]: encrypt(env) } });
}

/** The decrypted token set for a desktop-direct (local-oauth) connector. */
export function loadToken(id: string): StoredToken | undefined {
  return decrypt<StoredToken>(read().tokens?.[id], `token for '${id}'`, () => dropStored("tokens", id));
}

export function saveToken(id: string, token: StoredToken): void {
  const r = read();
  write({ ...r, tokens: { ...(r.tokens ?? {}), [id]: encrypt(token) } });
}

/** Drop ONLY the stored token for `id` (keep the spec + its credMode/client id/
 *  secret) — so a "Reconnecter" re-runs OAuth with fresh consent (new scopes)
 *  without the user re-entering their BYO keys. */
export function clearToken(id: string): void {
  const r = read();
  const tokens = { ...(r.tokens ?? {}) };
  delete tokens[id];
  write({ ...r, tokens });
}

/** The decrypted API key for a header-auth remote connector (e.g. Fireflies). */
export function loadApiKey(id: string): string | undefined {
  return decrypt<string>(read().apiKeys?.[id], `API key for '${id}'`, () => dropStored("apiKeys", id));
}

export function saveApiKey(id: string, key: string): void {
  const r = read();
  write({ ...r, apiKeys: { ...(r.apiKeys ?? {}), [id]: encrypt(key) } });
}
