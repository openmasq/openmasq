// Which MCP servers this run has, from the two places they can come from: the user's own
// declaration, and the client we are wrapping. ONE function for both callers — the CLI's
// `mcp status` and the running proxy read the same list — so a `login` never targets a server
// the proxy would not have connected.
import { existsSync } from "node:fs";
import { adoptFrom, type AdoptEvents } from "./adopt.js";
import type { OwnServer } from "./clients/index.js";
import { DEFAULT_MCP_CONFIG, readServers, type ServerSpec } from "./servers.js";

export interface ResolveOptions extends AdoptEvents {
  /** "" ⇒ ~/.openmasq/mcp.json, and its absence is not an error when a client can supply. */
  configPath: string;
  /** The wrapped client's own servers (`own.ts`), when there is one and we may take them. */
  own?: OwnServer[];
  adopt: boolean;
}

export function resolveSpecs(opts: ResolveOptions): ServerSpec[] {
  const path = opts.configPath || DEFAULT_MCP_CONFIG;
  // Required only when the user named it: with a client to take servers over from, an absent
  // ~/.openmasq/mcp.json simply means "everything comes from the client".
  let specs: ServerSpec[] = [];
  if (opts.configPath || existsSync(path) || !opts.own) specs = readServers(path);
  if (opts.own && opts.adopt) specs = specs.concat(adoptFrom(opts.own, specs, opts));
  return specs;
}
