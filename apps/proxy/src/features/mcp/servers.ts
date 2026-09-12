// The MCP servers the PROXY connects to — and the ONE place their credentials are read.
// The agent never sees this file: it talks to the proxy's own `/mcp` and gets tools whose
// arguments carry fakes, so a token or a cookie header stays on this side of the boundary.
// Shaped like Claude Desktop's `mcpServers` map, so an existing config can be pointed at
// as-is (`--mcp-config ~/Library/.../claude_desktop_config.json`).
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { openmasqDir } from "../../lib/stateDir.js";

export interface StdioSpec {
  id: string;
  transport: "stdio";
  command: string;
  args: string[];
  /** Passed to the child. Holds API keys — never logged, never returned to a caller. */
  env: Record<string, string>;
}

export interface HttpSpec {
  id: string;
  transport: "http";
  url: string;
  /** Holds `Authorization` — same rule as `env`. */
  headers: Record<string, string>;
  /**
   * A PRE-REGISTERED OAuth client, for a provider that will not register one for us. Most
   * remote MCP servers do (RFC 7591) and need none of this; Google's endpoints point at
   * `accounts.google.com`, which publishes no registration endpoint at all, so the client
   * has to come from its console. Present ⇒ `auth.ts` seeds it and the SDK skips
   * registration. Absent ⇒ the dynamic path, unchanged.
   */
  clientId?: string;
  /** Only for a confidential client. Absent ⇒ a public client, PKCE alone (RFC 8252). */
  clientSecret?: string;
  /** Space-separated scopes. Some providers refuse a request that asks for none. */
  scopes?: string;
}

export type ServerSpec = StdioSpec | HttpSpec;

export const DEFAULT_MCP_CONFIG = join(openmasqDir(), "mcp.json");

/** A server id prefixes every tool name as `${id}__${tool}`, and the routing splits on the
 *  FIRST `__`. So an id containing one would silently route `a__b__send` to a server called
 *  `a` — hence the second test, which the character class alone does not give. */
const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const usableId = (id: string): boolean => ID.test(id) && !id.includes("__");

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** String map or nothing — a number or a nested object in `env` is a malformed file, not a
 *  value to coerce: coercion is how a credential silently becomes "[object Object]". */
function strings(v: unknown, where: string): Record<string, string> {
  if (v === undefined) return {};
  if (!isRecord(v)) throw new Error(`${where} must be an object of strings`);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val !== "string") throw new Error(`${where}.${k} must be a string`);
    out[k] = val;
  }
  return out;
}

/**
 * Refuse a credentials file that others can read. The whole point of this feature is that
 * the secret has ONE home, and a home the group can read is not one. Fails CLOSED on a POSIX
 * system — a widened mode is a refusal, not a shrug.
 *
 * ⚠️ **Windows has no such bits to read.** Node derives `stat.mode` there from the single
 * read-only attribute (a writable file reports 0o666), so this test would refuse EVERY file
 * and the feature would simply not run. NTFS access is governed by ACLs, which `stat` does
 * not expose and `chmod` does not set. The check is therefore skipped there, and what
 * protects the file instead is the ACL the user's profile directory already carries —
 * inherited, not set by us. Said out loud rather than implied: on Windows this is a weaker
 * guarantee than on macOS/Linux, and `OPENMASQ_PROXY_KEY` (a key from a secret manager, so
 * no key file exists at all) is the way to close it.
 */
export function assertPrivate(
  path: string,
  stat: (p: string) => { mode: number } = statSync,
  platform: string = process.platform,
): void {
  if (platform === "win32") return;
  const { mode } = stat(path);
  if ((mode & 0o077) !== 0)
    throw new Error(
      `${path} is readable by other users (mode ${(mode & 0o777).toString(8)}). ` +
        `It holds your integration credentials: chmod 600 ${path}`,
    );
}

/** Parse the `mcpServers` map. Unknown shapes are refused rather than skipped: a server the
 *  user believes is connected but that we silently dropped is a hole in their expectations. */
export function parseServers(json: string): ServerSpec[] {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch (err) {
    throw new Error(`not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isRecord(doc)) throw new Error("the config must be a JSON object");
  const map = doc.mcpServers ?? doc.servers;
  if (!isRecord(map)) throw new Error('the config needs an "mcpServers" object');
  return parseServerMap(map);
}

/**
 * The same validation, on a map already lifted out of a document — what adoption reads from
 * a CLIENT's own configuration, where the map sits under a path of that client's choosing.
 */
export function parseServerMap(map: Record<string, unknown>): ServerSpec[] {
  const specs: ServerSpec[] = [];
  for (const [id, raw] of Object.entries(map)) {
    if (!usableId(id))
      throw new Error(`"${id}" is not a usable server id (lowercase, digits, - and _, no "__")`);
    if (!isRecord(raw)) throw new Error(`${id}: must be an object`);
    if (raw.disabled === true) continue;
    const url = raw.url ?? raw.href;
    if (typeof url === "string") {
      if (!/^https?:\/\//.test(url)) throw new Error(`${id}.url must be an http(s) URL`);
      const oauth: Pick<HttpSpec, "clientId" | "clientSecret" | "scopes"> = {};
      for (const key of ["clientId", "clientSecret", "scopes"] as const) {
        const v = raw[key];
        if (v === undefined) continue;
        if (typeof v !== "string") throw new Error(`${id}.${key} must be a string`);
        oauth[key] = v;
      }
      if (oauth.clientSecret && !oauth.clientId)
        throw new Error(`${id}: a clientSecret without a clientId cannot be used`);
      specs.push({
        id,
        transport: "http",
        url,
        headers: strings(raw.headers, `${id}.headers`),
        ...oauth,
      });
      continue;
    }
    if (typeof raw.command === "string") {
      if (!raw.command.trim()) throw new Error(`${id}.command is empty`);
      const args = raw.args ?? [];
      if (!Array.isArray(args) || args.some((a) => typeof a !== "string"))
        throw new Error(`${id}.args must be an array of strings`);
      specs.push({
        id,
        transport: "stdio",
        command: raw.command,
        args: args as string[],
        env: strings(raw.env, `${id}.env`),
      });
      continue;
    }
    throw new Error(`${id}: needs either "command" (stdio) or "url" (http)`);
  }
  return specs;
}

export interface ReadServersDeps {
  read?: (p: string) => string;
  stat?: (p: string) => { mode: number };
  platform?: string;
}

/** Read + validate the servers file. The error names the FILE, never a value inside it. */
export function readServers(path: string, deps: ReadServersDeps = {}): ServerSpec[] {
  const read = deps.read ?? ((p: string) => readFileSync(p, "utf8"));
  assertPrivate(path, deps.stat ?? statSync, deps.platform);
  try {
    return parseServers(read(path));
  } catch (err) {
    throw new Error(`${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
