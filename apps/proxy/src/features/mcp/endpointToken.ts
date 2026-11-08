// The key to `/mcp`. That endpoint re-exposes every connected service's tools and runs them
// with the credentials this process holds — it ACTS on the user's accounts, and a READ is not
// stopped by the write gate, so anything that reaches the port needs a key.
//
// The token is PERSISTED, not minted per run: a client that declares the endpoint ONCE
// (`gemini mcp add … <url>/mcp`) keeps that declaration across runs, and a rotating token
// would teach the user to work around the lock. It lives where the credentials it fronts
// already live — `~/.openmasq`, 0600 in a 0700 directory — so reaching the endpoint is no
// easier than reading the store behind it. It defends against everything that merely
// reaches the PORT (a page in a browser above all), not against a process already running
// as this user.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { openmasqDir } from "../../lib/stateDir.js";

const tokenPath = (dir = openmasqDir()): string => join(dir, "mcp.token");

/** 32 bytes, URL-safe: it travels in the endpoint's query string. */
const mint = (): string => randomBytes(32).toString("base64url");

/** A stored token has to LOOK like one before it is trusted as the key to the endpoint: a
 *  truncated or hand-edited file is replaced rather than used at whatever length it has. */
const usable = (s: string): boolean => /^[A-Za-z0-9_-]{32,}$/.test(s);

/**
 * The endpoint's token, read from the state directory or created there on first use.
 * Created 0600 inside a 0700 directory, like the key file beside it.
 */
export function endpointToken(dir = openmasqDir()): string {
  const path = tokenPath(dir);
  const found = readUsable(path);
  if (found) return found;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = claimToken(path, mint());
  if (token !== null) return token;
  // the file there is not a token (truncated, hand-edited): replaced
  const fresh = mint();
  writeFileSync(path, `${fresh}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600); // an existing file keeps its old mode without this
  } catch {
    // A filesystem with no permission model: the directory's ACL is what protects it.
  }
  return fresh;
}

const readUsable = (path: string): string | null => {
  if (!existsSync(path)) return null;
  const s = readFileSync(path, "utf8").trim();
  return usable(s) ? s : null;
};

/**
 * Create the token file with `token` unless a file is already there (`wx`): two proxies started
 * together would otherwise each write their own, and a client configured with the first would
 * be refused by the second. Returns the token in force — ours, or the one that won — or null
 * when the file there holds no usable token.
 */
export function claimToken(path: string, token: string): string | null {
  try {
    writeFileSync(path, `${token}\n`, { mode: 0o600, flag: "wx" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    return readUsable(path);
  }
  try {
    chmodSync(path, 0o600); // an existing file keeps its old mode without this
  } catch {
    // A filesystem with no permission model: the directory's ACL is what protects it.
  }
  return token;
}

/** Constant-time compare of two strings of any length. */
export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/** The endpoint a client is pointed at — the token rides the query string, the one place
 *  every MCP client carries verbatim (a `headers` map is not in all of their config shapes). */
export const endpointUrl = (base: string, token: string): string =>
  `${base}/mcp?t=${encodeURIComponent(token)}`;
