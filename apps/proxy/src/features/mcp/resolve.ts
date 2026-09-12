// Which MCP servers this run has, from the two places they can come from: the user's own
// declaration, and the client we are wrapping. ONE function for both callers — the CLI's
// `mcp status` and the running proxy read the same list — so a `login` never targets a server
// the proxy would not have connected.
import { existsSync } from "node:fs";
import { adoptFrom, type AdoptEvents } from "./adopt.js";
import type { OwnServer } from "./clients/index.js";
import type { McpPolicy } from "./policy.js";
import { DEFAULT_MCP_CONFIG, readServers, type ServerSpec } from "./servers.js";

export interface ResolveOptions extends AdoptEvents {
  /** "" ⇒ ~/.openmasq/mcp.json, and its absence is not an error when a client can supply. */
  configPath: string;
  /** The wrapped client's own servers (`own.ts`), when there is one and we may take them. */
  own?: OwnServer[];
  adopt: boolean;
  /** `proxy.json`'s `mcp` section: whose server each id is (`policy.ts`). */
  policy?: McpPolicy;
  /** A `source` line that changed the outcome, worth a line on the card. */
  onPolicy?: (id: string, text: string, tone: "info" | "warn") => void;
}

export function resolveSpecs(opts: ResolveOptions): ServerSpec[] {
  const path = opts.configPath || DEFAULT_MCP_CONFIG;
  // Required only when the user named it: with a client to take servers over from, an absent
  // ~/.openmasq/mcp.json simply means "everything comes from the client".
  let specs: ServerSpec[] = [];
  if (opts.configPath || existsSync(path) || !opts.own) specs = readServers(path);
  const keepOut = new Set<string>();
  const say = opts.onPolicy ?? (() => {});
  for (const [id, p] of Object.entries(opts.policy ?? {})) {
    const ours = specs.some((s) => s.id === id);
    const theirs = opts.own?.some((s) => s.id === id) ?? false;
    if (p.source === "off") {
      // Neither side: the tool is absent from the run, and said so when it would have been there.
      if (ours || theirs) say(id, "off, per proxy.json — absent from this run", "info");
      specs = specs.filter((s) => s.id !== id);
      keepOut.add(id);
    } else if (p.source === "client") {
      // Theirs, through the proxy — ours is set aside for the run. Still masked: adoption
      // connects it HERE, and exclusivity has already switched the client's own path off.
      if (ours) specs = specs.filter((s) => s.id !== id);
      if (ours && theirs)
        say(id, "the client's is taken, yours set aside — per proxy.json", "info");
      else if (!theirs && opts.own)
        say(
          id,
          `proxy.json says the client provides it, but it declares no ${id} — absent from this run`,
          "warn",
        );
    } else if (p.source === "openmasq") {
      // Ours, and ONLY ours: an absent declaration is an absent tool, never a fallback to the
      // client's — falling back is exactly what the line rules out.
      keepOut.add(id);
      if (!ours)
        say(
          id,
          `proxy.json says openmasq provides it, but your servers file declares no ${id} — absent from this run (the client's own is not taken)`,
          "warn",
        );
      else if (theirs) say(id, "yours, per proxy.json — the client's is set aside", "info");
    }
  }
  if (opts.own && opts.adopt) specs = specs.concat(adoptFrom(opts.own, specs, opts, keepOut));
  return specs;
}
