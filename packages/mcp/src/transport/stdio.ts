import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { McpConnection } from "../types";
import { CLIENT_INFO, callToolVia, listToolsVia } from "./wrap";

/** Spec for a stdio MCP server (a local child process — the SDK spawns it). */
export interface StdioServerSpec {
  /** Stable id, used to namespace this server's tools. */
  id: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /**
   * Called when the CHILD's transport closes unexpectedly (it exited, was killed, or
   * crashed) — NOT on an intentional {@link McpConnection.close}. Same contract as
   * `HttpServerSpec.onClose`, and it exists for the same reason: without it the owner
   * keeps `listTools`/`callTool`ing a corpse and the SDK answers « Not connected »
   * forever. The HTTP half got this hook first; the stdio half went without, and the
   * agent browser's `@playwright/mcp` child (a stdio server that dies whenever the
   * browser does) turned that gap into 1366 identical reports in eight days.
   */
  onClose?: (id: string) => void;
  /**
   * A message written as the FIRST line on the child's stdin, before `initialize`: how a
   * spawner hands the child a secret without its exec environment (readable by any process
   * of the same user, e.g. `ps -E`). The child must consume that line itself before its MCP
   * server reads stdin.
   */
  preamble?: JSONRPCMessage;
}

/** `t`, with `preamble` sent right after `start` — so before the Client's `initialize`. */
export function withPreamble(t: Transport, preamble: JSONRPCMessage): Transport {
  return new Proxy(t, {
    get(target, prop) {
      if (prop === "start") {
        return async () => {
          await target.start();
          await target.send(preamble);
        };
      }
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value, target);
    },
  });
}

/** Connect over stdio (spawns `command`). */
export async function connectStdio(spec: StdioServerSpec): Promise<McpConnection> {
  const stdio = new StdioClientTransport({
    command: spec.command,
    args: spec.args,
    env: spec.env,
  });
  const transport = spec.preamble ? withPreamble(stdio, spec.preamble) : stdio;
  const client = new Client(CLIENT_INFO);
  // Set by our own `close()` so the resulting transport-close doesn't fire `onClose`
  // (meant for UNEXPECTED deaths only) — the flag the HTTP server calls `closing`.
  let closing = false;
  // Hook the Client's PUBLIC `onclose`, never `transport.onclose` which the SDK owns for
  // its internal routing (`http.ts` says the same, for the same reason). Wired BEFORE
  // `connect`: a child that dies during startup must be reported too.
  client.onclose = () => {
    if (!closing) spec.onClose?.(spec.id);
  };
  await client.connect(transport);
  return {
    id: spec.id,
    listTools: () => listToolsVia(client, spec.id),
    callTool: (call) => callToolVia(client, call),
    close: () => {
      closing = true;
      return client.close();
    },
  };
}
