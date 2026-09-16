// Live connections to the real MCP servers. They belong to the PROXY, not to the agent:
// the child process's env and the remote's `Authorization` are set here and read nowhere
// else, so a credential never crosses back over `/mcp`.
//
// A connection that dies is dropped rather than probed forever (the stdio child exits, the
// remote drops its stream): `@openmasq/mcp` reports it through `onClose`, and a tool list
// that no longer names a dead server is how the model learns to stop calling it.
import type { McpConnection, McpTool } from "@openmasq/mcp";
import { connectHttp, connectStdio, UnauthorizedError } from "@openmasq/mcp/transport";
import type { OAuthClientProvider } from "@openmasq/mcp/transport";
import type { HttpSpec, ServerSpec } from "./servers.js";

/**
 * Why a server would not connect, in terms the operator can act on. The common case after a
 * take-over: the client authorised the remote itself and keeps the OAuth token in its own
 * store, so the URL alone gets a 401. That token is not ours to reuse.
 */
export function whyDown(err: unknown, id = ""): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof UnauthorizedError || /invalid_token|unauthorized|\b401\b/i.test(msg))
    return `not signed in here — run: openmasq-proxy mcp login ${id || "<server>"}`;
  return msg;
}

export interface UpstreamEvents {
  /** A server connected, with how many tools it advertised. */
  onUp?: (id: string, tools: number) => void;
  /** A server refused to connect, or died later. `why` names the server, never a secret. */
  onDown?: (id: string, why: string) => void;
}

export interface Upstream {
  /** Live connections, in declaration order. Dead ones are gone. */
  connections(): McpConnection[];
  /** Every advertised tool, cached for `ttlMs` so a per-request client costs no round-trip. */
  tools(): Promise<McpTool[]>;
  /**
   * Bring the live set to `specs`, touching ONLY what changed: a new id connects, a gone id
   * closes, an id in `changed` (its entry or its credentials differ) reconnects; the others
   * keep their connection and any call in flight. Returns the ids that moved, in order.
   */
  apply(specs: ServerSpec[], changed?: ReadonlySet<string>): Promise<string[]>;
  close(): Promise<void>;
}

/** Wrap a connection so repeated `listTools()` inside the cache window costs nothing. The
 *  cache is per connection: one slow server must not stale-cache the others. */
function cached(connection: McpConnection, ttlMs: number, now: () => number): McpConnection {
  let at = 0;
  let tools: McpTool[] | undefined;
  return {
    ...connection,
    id: connection.id,
    listTools: async () => {
      if (tools && now() - at < ttlMs) return tools;
      tools = await connection.listTools();
      at = now();
      return tools;
    },
    callTool: (call) => connection.callTool(call),
    close: () => connection.close(),
  };
}

export interface ConnectOptions extends UpstreamEvents {
  toolTtlMs?: number;
  now?: () => number;
  /** Injected by tests: build a connection from a spec. */
  connect?: (spec: ServerSpec, onClose: (id: string) => void) => Promise<McpConnection>;
  /**
   * The stored OAuth material for a remote server, when it has any. Silent by design: this
   * runs at startup, and a consent page opened on its own would hijack the screen. No tokens
   * ⇒ the connection fails with `not signed in`, which names the command that fixes it.
   */
  oauth?: (spec: HttpSpec) => OAuthClientProvider | undefined;
}

async function connectSpec(
  spec: ServerSpec,
  onClose: (id: string) => void,
  oauth?: (spec: HttpSpec) => OAuthClientProvider | undefined,
): Promise<McpConnection> {
  if (spec.transport === "stdio")
    return connectStdio({
      id: spec.id,
      command: spec.command,
      args: spec.args,
      // The child inherits the proxy's PATH etc. plus the spec's own secrets. Merged HERE
      // and nowhere else, so the merge is auditable in one place.
      env: { ...(process.env as Record<string, string>), ...spec.env },
      onClose,
    });
  const authProvider = oauth?.(spec);
  return connectHttp({
    id: spec.id,
    url: spec.url,
    headers: spec.headers,
    ...(authProvider ? { authProvider } : {}),
    onClose,
  });
}

/**
 * Connect every declared server. A server that fails is REPORTED and skipped — the proxy
 * still starts, because refusing to mask anything because one integration is down would
 * push the user back to the unmasked path. What is never skipped is the redaction itself.
 */
export async function connectUpstream(
  specs: ServerSpec[],
  opts: ConnectOptions = {},
): Promise<Upstream> {
  const now = opts.now ?? Date.now;
  const ttl = opts.toolTtlMs ?? 30_000;
  const connect =
    opts.connect ??
    ((spec: ServerSpec, onClose: (id: string) => void) => connectSpec(spec, onClose, opts.oauth));
  const live = new Map<string, McpConnection>();
  const drop = (id: string, why: string) => {
    if (live.delete(id)) opts.onDown?.(id, why);
  };
  const up = async (spec: ServerSpec) => {
    try {
      const connection = await connect(spec, (id) => drop(id, "the server closed"));
      const wrapped = cached(connection, ttl, now);
      live.set(spec.id, wrapped);
      opts.onUp?.(spec.id, (await wrapped.listTools()).length);
    } catch (err) {
      // The message can carry a spawn line; the id and a short reason are what help.
      opts.onDown?.(spec.id, whyDown(err, spec.id));
    }
  };
  /** Known ids, connected or not: a server that failed at startup must still count as
   *  "already tried" so a reload does not report it twice, and as "changed" when it is. */
  const known = new Set<string>();

  for (const spec of specs) {
    known.add(spec.id);
    await up(spec);
  }

  return {
    connections: () => [...live.values()],
    async apply(next, changed = new Set()) {
      const moved: string[] = [];
      const wanted = new Set(next.map((s) => s.id));
      for (const id of [...known]) {
        if (wanted.has(id) && !changed.has(id)) continue;
        known.delete(id);
        const gone = live.get(id);
        if (gone) {
          live.delete(id);
          await gone.close().catch(() => {});
        }
        if (!wanted.has(id)) {
          moved.push(id);
          opts.onDown?.(id, "no longer declared");
        }
      }
      for (const spec of next) {
        if (known.has(spec.id)) continue;
        known.add(spec.id);
        moved.push(spec.id);
        await up(spec);
      }
      return moved;
    },
    async tools() {
      const all: McpTool[] = [];
      for (const connection of live.values()) {
        try {
          for (const tool of await connection.listTools())
            all.push({ ...tool, name: `${connection.id}__${tool.name}`, serverId: connection.id });
        } catch (err) {
          drop(connection.id, whyDown(err, connection.id));
        }
      }
      return all;
    },
    async close() {
      const all = [...live.values()];
      live.clear();
      await Promise.allSettled(all.map((c) => c.close()));
    },
  };
}
