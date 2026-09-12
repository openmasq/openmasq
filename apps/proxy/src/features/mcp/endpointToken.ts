// The key to `/mcp`. That endpoint re-exposes every connected service's tools and runs them
// with the credentials this process holds — it ACTS on the user's accounts, where `/console`
// only shows what was masked. It is the surface that most needs a key, and it is the one that
// had none: anything that could reach the port could list the tools and call them, and a
// READ is not stopped by the write gate.
//
// The token is PERSISTED, not minted per run, and that is deliberate. A client we configure
// ourselves gets its endpoint written fresh every time, but one that declares it ONCE (Gemini
// is told `gemini mcp add … <url>/mcp`) keeps that declaration across runs; a rotating token
// would break it on the next start and teach the user to work around the lock.
//
// It lives where the credentials it fronts already live — `~/.openmasq`, 0600 in a 0700
// directory — so reaching the endpoint is no easier than reading the store behind it. That is
// the bar it is meant to set: it does not defend against a process already running as this
// user (nothing here does), it defends against everything that merely reaches the PORT — a
// page in a browser above all, which can open a loopback URL but cannot read a file.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { openmasqDir } from "../../lib/stateDir.js";

export const tokenPath = (dir = openmasqDir()): string => join(dir, "mcp.token");

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
  if (existsSync(path)) {
    const found = readFileSync(path, "utf8").trim();
    if (usable(found)) return found;
  }
  const token = mint();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
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
