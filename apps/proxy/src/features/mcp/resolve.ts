// Which MCP servers this run has, from the two places they can come from: the user's own
// declaration, and the client we are wrapping. One home, because the CLI's `mcp status` and
// the running proxy must agree on the list — a `login` for a server the proxy would not have
// connected is a login that helps nobody.
import { existsSync } from "node:fs";
import type { AgentClient } from "./clients.js";
import { adoptFrom, type AdoptEvents } from "./adopt.js";
import { DEFAULT_MCP_CONFIG, readServers, type ServerSpec } from "./servers.js";

export interface ResolveOptions extends AdoptEvents {
  /** "" ⇒ ~/.openmasq/mcp.json, and its absence is not an error when a client can supply. */
  configPath: string;
  client?: AgentClient;
  adopt: boolean;
  cwd: string;
  home: string;
}

export function resolveSpecs(opts: ResolveOptions): ServerSpec[] {
  const path = opts.configPath || DEFAULT_MCP_CONFIG;
  // Required only when the user named it: with a client to take servers over from, an absent
  // ~/.openmasq/mcp.json simply means "everything comes from the client".
  let specs: ServerSpec[] = [];
  if (opts.configPath || existsSync(path) || !opts.client) specs = readServers(path);
  if (opts.client && opts.adopt)
    specs = specs.concat(adoptFrom(opts.client, opts.cwd, opts.home, specs, opts));
  return specs;
}
