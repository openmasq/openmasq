import { randomBytes } from "node:crypto";
import { createPersistence } from "./persistence.js";

/**
 * OAuth state. Durable records (registered clients + issued tokens, which carry
 * the user's upstream provider tokens) are seeded from and saved to an ENCRYPTED
 * local file (`persistence`) so a user stays connected across broker restarts —
 * with no central database. Ephemeral records (pending federations, single-use
 * auth codes) stay in memory only.
 *
 * SECURITY: ids are 256-bit crypto-random; auth codes are single-use with a short
 * TTL; upstream provider tokens live only inside `BrokerToken`, are encrypted at
 * rest, and are never serialised back to any client.
 */

export interface RegisteredClient {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
  createdAt: number;
}

/** Pending federation: created at /authorize, consumed at the upstream callback. */
export interface PendingAuth {
  platform: string;
  clientId: string;
  clientRedirectUri: string;
  clientState: string;
  codeChallenge: string; // S256 (the desktop client's challenge)
  /** PKCE verifier for the broker→provider leg, when the platform is a public client. */
  upstreamVerifier?: string;
  createdAt: number;
}

/** Broker authorization code: created at the callback, consumed at /token. */
export interface AuthCode {
  platform: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  upstream: UpstreamTokens;
  createdAt: number;
}

export interface UpstreamTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

/** Broker access token → the upstream tokens it fronts (server-side only). */
export interface BrokerToken {
  platform: string;
  upstream: UpstreamTokens;
  createdAt: number;
  expiresAt: number;
}

export const TTL = {
  pending: 10 * 60_000,
  code: 60_000,
  token: 60 * 60_000,
} as const;

const token = () => randomBytes(32).toString("base64url");

const clients = new Map<string, RegisteredClient>();
const pending = new Map<string, PendingAuth>();
const codes = new Map<string, AuthCode>();
const tokens = new Map<string, BrokerToken>();
const refresh = new Map<string, string>(); // refreshToken -> accessToken

// Seed the durable maps from the encrypted local file (no-op without a dataDir).
const persistence = createPersistence();
const seed = persistence.load();
if (seed) {
  for (const c of seed.clients) clients.set(c.clientId, c);
  const now = Date.now();
  for (const [k, t] of seed.tokens) if (t.expiresAt > now) tokens.set(k, t);
  for (const [r, a] of seed.refresh) if (tokens.has(a)) refresh.set(r, a);
}

/** Persist the durable subset (clients + live tokens). Ephemeral state is skipped. */
function saveDurable(): void {
  persistence.save({
    clients: [...clients.values()],
    tokens: [...tokens.entries()],
    refresh: [...refresh.entries()],
  });
}

function fresh<T extends { createdAt: number }>(rec: T | undefined, ttl: number): T | undefined {
  if (!rec) return undefined;
  if (Date.now() - rec.createdAt > ttl) return undefined;
  return rec;
}

export const store = {
  registerClient(redirectUris: string[], clientName?: string): RegisteredClient {
    const client: RegisteredClient = {
      clientId: `c_${token()}`,
      redirectUris,
      clientName,
      createdAt: Date.now(),
    };
    clients.set(client.clientId, client);
    saveDurable();
    return client;
  },
  getClient: (id: string) => clients.get(id),

  putPending(p: Omit<PendingAuth, "createdAt">): string {
    const state = token();
    pending.set(state, { ...p, createdAt: Date.now() });
    return state;
  },
  takePending(state: string): PendingAuth | undefined {
    const rec = fresh(pending.get(state), TTL.pending);
    pending.delete(state);
    return rec;
  },

  putCode(c: Omit<AuthCode, "createdAt">): string {
    const code = token();
    codes.set(code, { ...c, createdAt: Date.now() });
    return code;
  },
  /** Single-use: the code is deleted on read. */
  takeCode(code: string): AuthCode | undefined {
    const rec = fresh(codes.get(code), TTL.code);
    codes.delete(code);
    return rec;
  },

  issueToken(platform: string, upstream: UpstreamTokens): {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  } {
    const accessToken = token();
    const refreshToken = token();
    tokens.set(accessToken, {
      platform,
      upstream,
      createdAt: Date.now(),
      expiresAt: Date.now() + TTL.token,
    });
    refresh.set(refreshToken, accessToken);
    saveDurable();
    return { accessToken, refreshToken, expiresIn: Math.floor(TTL.token / 1000) };
  },
  resolveToken(accessToken: string): BrokerToken | undefined {
    const rec = tokens.get(accessToken);
    if (!rec) return undefined;
    if (Date.now() > rec.expiresAt) {
      tokens.delete(accessToken);
      return undefined;
    }
    return rec;
  },
  rotateRefresh(refreshToken: string): { accessToken: string; refreshToken: string; expiresIn: number } | undefined {
    const oldAccess = refresh.get(refreshToken);
    if (!oldAccess) return undefined;
    const rec = tokens.get(oldAccess);
    refresh.delete(refreshToken);
    if (oldAccess) tokens.delete(oldAccess);
    if (!rec) return undefined;
    return this.issueToken(rec.platform, rec.upstream);
  },
};
