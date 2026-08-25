// The simulated-connector machinery + the fleet barrel.
//
// ⚠️ The METADATA is the thing under test, the RESULTS are not. A tool's name,
// description and schema are all the model ever reasons over when it decides what to
// call — so those are transcribed from the real connectors and must track them. What a
// tool RETURNS is a fixture: an eval must never dispatch on a real account (a
// `send_email` eval that hits the real Gmail sends a real email; a live-web read fails
// when the web changes under it — a flaky test, not a finding).
//
// Keep a server SMALL and REALISTIC. Handing the model a 3-tool Gmail when the real one
// exposes 30 makes the pick artificially easy and the eval passes for the wrong reason.

import type { ToolArgs } from "../transcript";

export interface FakeTool {
  /** BARE name, as the real server exposes it (`search`, `send_email`). The harness
   *  namespaces it to `${server}__${name}` — the convention the loop's classifiers key
   *  off (`isWriteTool`, `isSearchTool`, the browser's `browser_*` detection). */
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** What the call returns. A function sees the WIRE (real, un-redacted) args — which is
   *  how a fixture can answer differently for a real recipient vs a fake one. */
  result: string | ((args: ToolArgs) => string);
}

export interface FakeServer {
  /** A REAL `@openmasq/catalog/mcp` connector id — the org-policy gate and
   *  `toolRedactionPolicy` both key off it, so an invented id evaluates nothing. */
  id: string;
  tools: FakeTool[];
}

export const str = (desc: string): { type: "string"; description: string } => ({
  type: "string",
  description: desc,
});

/** `${server}__${tool}` — the namespacing the loop and its classifiers expect. */
export const qualify = (server: string, tool: string): string => `${server}__${tool}`;

/** Flatten servers into the `listTools` shape the Host returns. */
export function toolDefs(servers: FakeServer[]): {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
}[] {
  return servers.flatMap((s) =>
    s.tools.map((t) => ({
      name: qualify(s.id, t.name),
      description: t.description,
      inputSchema: t.inputSchema,
      serverId: s.id,
    })),
  );
}

/** Resolve a namespaced call to its fixture result. An UNKNOWN tool throws rather than
 *  returning "": a silent empty result reads to the model as "no data" and the eval then
 *  scores a wiring bug as a model choice. */
export function resultFor(servers: FakeServer[], name: string, args: ToolArgs): string {
  for (const s of servers) {
    for (const t of s.tools) {
      if (qualify(s.id, t.name) === name) return typeof t.result === "function" ? t.result(args) : t.result;
    }
  }
  throw new Error(
    `eval: no fake server exposes "${name}" (offered: ${toolDefs(servers)
      .map((t) => t.name)
      .join(", ")})`,
  );
}
