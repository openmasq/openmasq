import { join } from "node:path";
import type { AgentClient, OwnServer } from "./types.js";

/** `opencode debug config` → the RESOLVED configuration, every layer merged: the remote
 *  organisation defaults, the global file, a custom one, the project's. Reading its `mcp`
 *  map is therefore the complete list, which reading files of our own could never be. */
export function parseOpencodeConfig(stdout: string): OwnServer[] {
  const doc: unknown = JSON.parse(stdout.replace(/\x1b\[[0-9;]*m/g, ""));
  if (typeof doc !== "object" || doc === null) throw new Error("expected a JSON object");
  const map = (doc as Record<string, unknown>).mcp;
  if (map === undefined) return [];
  if (typeof map !== "object" || map === null) throw new Error("`mcp` is not an object");
  const own: OwnServer[] = [];
  for (const [id, raw] of Object.entries(map as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    if (entry.enabled === false) continue;
    if (typeof entry.url === "string") {
      own.push({ id, scope: "opencode", url: entry.url, raw: { type: "http", url: entry.url } });
      continue;
    }
    // opencode writes a local server as one array: the command and its arguments together.
    const cmd = Array.isArray(entry.command) ? entry.command.filter((a) => typeof a === "string") : [];
    if (cmd.length)
      own.push({
        id,
        scope: "opencode",
        raw: { command: cmd[0], args: cmd.slice(1), env: entry.environment ?? {} },
      });
  }
  return own;
}

/**
 * opencode. Its only lever is a config file named by `OPENCODE_CONFIG`, and that file is
 * MERGED between the global one and the project's — so ours can add a server and switch the
 * others off one by one, but it cannot outrank a project's `opencode.json`. Measured on
 * 1.18.30: with our file alone the decoy came back `disabled` and `openmasq` `connected`; add
 * a project file re-enabling the decoy and it is `connected` again. There is no
 * `disabled_mcps` allow-list in the binary, whatever the forums say — grepped, absent.
 *
 * That layer above us is exactly why `recheck` exists: the probe runs a second time UNDER our
 * config, and a server still standing blocks the run's exclusivity instead of decorating it.
 *
 * The env slot is single: a user who already sets `OPENCODE_CONFIG` would lose their file to
 * ours, and with it settings that have nothing to do with MCP. That is a refusal, not a
 * merge — silently rewriting someone's configuration is what this whole file avoids.
 */
export const OPENCODE: AgentClient = {
  id: "opencode",
  probe: { args: ["debug", "config"], parse: parseOpencodeConfig },
  recheck: (stdout, ourId) =>
    parseOpencodeConfig(stdout)
      .map((s) => s.id)
      .filter((id) => id !== ourId),
  exclusive: ({ url, own, dir, env }) => {
    if (env.OPENCODE_CONFIG)
      return {
        blocked:
          "OPENCODE_CONFIG is already set, and opencode reads only one — unset it for this " +
          "run (or move what it holds into the project's opencode.json)",
      };
    const path = join(dir, "opencode.json");
    const mcp: Record<string, unknown> = {
      openmasq: { type: "remote", url, enabled: true },
    };
    for (const s of own) if (s.url !== url) mcp[s.id] = { enabled: false };
    return {
      args: [],
      env: { OPENCODE_CONFIG: path },
      write: {
        path,
        content: `${JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp }, null, 2)}\n`,
      },
    };
  },
};
