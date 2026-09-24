// What `server.ts` hands the console router — assembled here rather than inline, because the
// one decision inside it deserves a file where it can be read: WHETHER THE PAGE MAY CHANGE
// ANYTHING.
//
// It may, only when this run has a terminal. The gate that stands between the live view and
// less masking asks for a `y` there (`maskingGate.ts`), so a run with nobody to ask is given
// no way to ask: `applyMasking` is absent and the route answers 404 like any unknown path.
// That is the honest shape of it — a wrapped tool owns the screen, a service has no screen at
// all, and a route that existed but always refused would invite retrying.
import type { ProxyConfig } from "../../config/config.js";
import { packageVersion } from "../../lib/version.js";
import type { MaskerSet } from "../../lib/maskers.js";
import type { McpPolicy } from "../mcp/policy.js";
import { createPolicyReload } from "../mcp/policyReload.js";
import { createApplyMasking } from "./applyMasking.js";
import type { ConsoleBus } from "./events.js";
import { createMaskingGate } from "./maskingGate.js";
import type { ConsoleRouteDeps } from "./routes.js";

export interface BuildConsoleDeps {
  bus: ConsoleBus;
  token: string;
  startedAt: number;
  config: ProxyConfig;
  maskers: MaskerSet;
  /** The live policy object — re-pointed in place, so this is the same one the bridge reads. */
  policy: McpPolicy;
  /** Is there a terminal to confirm a loosening on? */
  interactive: boolean;
  note: (text: string, tone?: "info" | "warn" | "ok") => void;
  /** The servers answering on this run; absent without `--mcp`. */
  servers?: string[];
}

/** Each connected server's level, keyed by id. `servers` carries display strings
 *  (`notion (strict, ours)`), so the id is the part before the parenthesis. */
function levelsOf(d: BuildConsoleDeps): Record<string, { level: string; own: boolean }> {
  const out: Record<string, { level: string; own: boolean }> = {};
  for (const entry of d.servers ?? []) {
    const id = entry.split(" (")[0] ?? entry;
    out[id] = { level: d.maskers.levelOf(id), own: d.policy[id]?.level !== undefined };
  }
  return out;
}

export function buildConsoleDeps(d: BuildConsoleDeps): ConsoleRouteDeps {
  return {
    bus: d.bus,
    token: d.token,
    // Derived rather than passed: the version is READ from the package (never a compiled-in
    // constant), and the footer's command is the wrapped tool's, or our own name.
    version: packageVersion(),
    command: d.config.command[0] ?? "openmasq-proxy",
    startedAt: d.startedAt,
    config: d.config,
    ...(d.config.mcp && d.servers
      ? {
          mcp: { servers: d.servers, writes: d.config.mcpWrites },
          // A FUNCTION, not a snapshot: the `l` key and the page itself both move a level
          // while a page is open, and a value captured at start would age.
          mcpLevels: () => levelsOf(d),
        }
      : {}),
    ...(d.interactive
      ? {
          applyMasking: createApplyMasking({
            gate: createMaskingGate({ note: d.note }),
            defaultLevel: () => d.config.level,
            // ⚠️ RE-READ, not re-point from memory. `applyMasking` has just written the file;
            // repointing from the policy object still in hand would apply what was there
            // BEFORE the write, and the page would be told "done" about the old masking.
            // This is the same reader the watcher uses, so a change made here and one made in
            // an editor land through one path.
            remask: createPolicyReload({ maskers: d.maskers, policy: d.policy, note: d.note }),
          }),
        }
      : {}),
  };
}
