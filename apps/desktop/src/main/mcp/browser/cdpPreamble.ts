import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { readLineSync } from "./agentLaunch";

/**
 * How main hands the @playwright/mcp child its CDP endpoint. The endpoint's PATH is the CDP
 * broker's only secret (`cdpBroker.ts`): whoever knows it drives the agent browser, logged-in
 * SaaS sessions included. An exec environment is NOT private — any process of the same user
 * reads it (`ps -wwE`, `KERN_PROCARGS2` on macOS, `/proc/<pid>/environ` on Linux), and deleting
 * it from `process.env` later changes nothing, the kernel keeps the original. So it travels as
 * the FIRST line on the child's stdin (a pipe only the spawner holds): a JSON-RPC notification,
 * which the child consumes before its MCP server reads anything. Pinned in `cdpPreamble.test.ts`.
 */

/** `http(s)://127.0.0.1:<port>…` or `ws(s)://…` — the shape of the endpoint main hands over. */
export function isLoopbackCdpEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return ["http:", "https:", "ws:", "wss:"].includes(u.protocol) && u.hostname === "127.0.0.1" && !!u.port;
  } catch {
    return false;
  }
}

const CDP_PREAMBLE_METHOD = "openmasq/cdp-endpoint";
const MAX_PREAMBLE = 512;

export function cdpPreamble(endpoint: string): JSONRPCMessage {
  return { jsonrpc: "2.0", method: CDP_PREAMBLE_METHOD, params: { endpoint } };
}

/** The endpoint from the preamble line; undefined unless it is exactly our notification
 *  carrying a loopback endpoint. */
export function parseCdpPreamble(line: string | null): string | undefined {
  if (!line) return undefined;
  try {
    const msg = JSON.parse(line) as { jsonrpc?: unknown; method?: unknown; params?: { endpoint?: unknown } };
    if (msg.jsonrpc !== "2.0" || msg.method !== CDP_PREAMBLE_METHOD) return undefined;
    const endpoint = msg.params?.endpoint;
    return typeof endpoint === "string" && isLoopbackCdpEndpoint(endpoint) ? endpoint : undefined;
  } catch {
    return undefined;
  }
}

/** Child side: read and parse the first stdin line, without consuming a byte past it. */
export function readCdpPreamble(read: (buf: Buffer) => number): string | undefined {
  return parseCdpPreamble(readLineSync(read, 10_000, Date.now, MAX_PREAMBLE));
}
