import { app, safeStorage } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { StoredOAuthState } from "@openmasq/mcp/transport"; import { BRAND } from "@openmasq/branding"; import type { CredMode } from "./credMode";
import { encryptionAvailable } from "../store/safeStore";
import { withCatalogUrl } from "./presetUrl";
import { assertPlaintextAllowed } from "../store/atRestPolicy";

/**
 * Durable, PER-ACCOUNT storage for MCP connectors. Specs are plain; OAuth state, tokens
 * and keys are `safeStorage`-encrypted, base64. Plaintext fallback only where the at-rest
 * policy allows it.
 */
export interface ServerSpec {
  /** The connection INSTANCE id: the connector id for the first account, then
   *  `${connectorId}--${suffix}`. Everything is keyed by it, so accounts never collide. */
  id: string;
  name: string;
  /** The catalog connector id this instance is an account OF (multi-account). Absent
   *  ⇒ this spec's `id` IS the connector id (the first/only account). */
  connectorId?: string;
  /** Human account label, shown in the UI and injected (masked) into tool descriptions. */
  label?: string;
  /** STABLE per-account identity, used to DEDUPE. Best-effort. */
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
  /** OAuth client id for a `byo` local-oauth connector (public). */
  clientId?: string;
  /** OAuth client secret for a `byo` connector that needs one ("Desktop app" secrets are
   *  NON-confidential; PKCE is the real protection). */
  clientSecret?: string;
}

/** A stored OAuth token for a desktop-direct connector; refresh fields only where the
 *  provider has them. */
export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms when `accessToken` expires (Google); absent = no known expiry. */
  expiresAt?: number;
  /** The scopes the server actually GRANTED (granular consent lets the user untick one);
   *  drives the tool-listing filter (`connectors/scopes.ts`). Absent ⇒ the requested list. */
  scopes?: string[];
}

interface Raw {
  servers: ServerSpec[];
  /** id → encrypted StoredOAuthState (http servers). */
  oauth: Record<string, string>;
  /** id → encrypted env values (stdio servers). */
  secrets: Record<string, string>;
  /** id → loopback redirect port. Plain: not a secret, and it must stay stable. */
  ports?: Record<string, number>;
  /** id → encrypted access token (local-oauth desktop-direct connectors). */
  tokens?: Record<string, string>;
  /** id → encrypted API key (header-auth remote connectors, e.g. Fireflies). */
  apiKeys?: Record<string, string>;
}

/**
 * Scoped to the signed-in account (`accounts/mcp-<uid>.json`, {@link setPersistUser}), so a
 * shared machine never leaves one account's tokens usable by another. Signed out ⇒ an
 * in-memory store NEVER written to disk.
 */
let currentUserId: string | null = null;
let cache: Raw | null = null;

/** `uid` comes from the RENDERER and is interpolated into a path: sanitize it. */
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
    // Owner-only, like keys.enc: cheap defence-in-depth for the plaintext-fallback case.
    writeFileSync(path, JSON.stringify(r, null, 2), { mode: 0o600 });
  } catch (err) {
    console.error("[mcp] failed to write mcp.json:", err);
  }
}

/**
 * Re-point the store at THIS account's file (memory-only when signed out). The FIRST
 * account to sign in ADOPTS the legacy shared `mcp.json` ONCE (marker-gated), so no OTHER
 * account inherits it. Callers close live connections BEFORE this (`mcp/index.ts`).
 */
export function setPersistUser(userId: string | null): void {
  // An all-illegal uid ⇒ signed-out (fail closed).
  const safe = userId == null ? null : safeUid(userId) || null;
  if (safe) maybeAdoptLegacy(safe);
  currentUserId = safe;
  cache = null;
}

/** One-time: the legacy shared `mcp.json` goes to the first signing-in account, then the
 *  marker stops anyone else inheriting it. */
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

// A catalog preset's endpoint URL is refreshed from the catalog on every read, so a vendor
// moving its endpoint doesn't strand already-connected users (`presetUrl.ts`).
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
    // (a) A PLAINTEXT-FALLBACK entry (written without a keychain) is readable as
    //     base64-JSON: recover it, never drop it.
    try {
      return JSON.parse(Buffer.from(enc, "base64").toString("utf8")) as T;
    } catch {
      /* not plaintext JSON either — fall through */
    }
    // (b) DROP only when the keychain IS available and still can't decrypt (a real
    //     key↔ciphertext mismatch). A keychain MISS is transient: keep the entry, skip
    //     it this session (non-destructive, like dbCrypto).
    console.warn(`[mcp] unreadable ${label}: ${err instanceof Error ? err.message : String(err)}`);
    if (keychain) onCorrupt?.();
    return undefined;
  }
}

/** Remove a permanently-unreadable encrypted entry. */
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

/** Drop ONLY the token (keep the spec + BYO client), so a reconnect re-runs OAuth. */
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
