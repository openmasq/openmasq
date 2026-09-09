import type { AgentClient, OwnServer } from "./types.js";

/** A `-c` key is a dotted TOML path, and a path segment only addresses a BARE key. An id that
 *  is not one cannot be switched off this way, and half-applied exclusivity is none. */
const CODEX_ID = /^[A-Za-z0-9_-]+$/;

/** `codex mcp list --json` → the servers it would load. A disabled one is left out: it is not
 *  part of the session, so there is nothing to take over and nothing to switch off. */
export function parseCodexList(stdout: string): OwnServer[] {
  const doc: unknown = JSON.parse(stdout);
  if (!Array.isArray(doc)) throw new Error("expected a JSON array of servers");
  const own: OwnServer[] = [];
  for (const entry of doc) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, enabled, transport } = entry as Record<string, unknown>;
    if (typeof name !== "string" || enabled === false) continue;
    if (typeof transport !== "object" || transport === null) continue;
    const t = transport as Record<string, unknown>;
    if (typeof t.url === "string") {
      own.push({ id: name, scope: "codex", url: t.url, raw: { type: "http", url: t.url } });
      continue;
    }
    if (typeof t.command === "string")
      own.push({
        id: name,
        scope: "codex",
        raw: { command: t.command, args: t.args ?? [], env: t.env ?? {} },
      });
  }
  return own;
}

/**
 * Codex. Its configuration is TOML, spread over `~/.codex/config.toml` and a project's own
 * `.codex/config.toml`, so its servers are not read out of a file here — they are ASKED of
 * the binary (`codex mcp list --json`), the one resolver that sees everything Codex loads.
 *
 * There is no single switch, but `-c` overrides do the job exactly: one
 * `mcp_servers.<id>.enabled=false` per server it has, plus ours as an inline table. Measured
 * on 0.149.1: a whole-table override MERGES (ours is added, theirs stay), which is why the
 * disabling is per server and why an id we cannot address blocks rather than half-applies.
 * Verified against a live proxy: `codex mcp list` came back with its two servers `disabled`
 * and `openmasq` `enabled`.
 */
export const CODEX: AgentClient = {
  id: "codex",
  probe: { args: ["mcp", "list", "--json"], parse: parseCodexList },
  exclusive: ({ url, own }) => {
    const unaddressable = own.filter((s) => !CODEX_ID.test(s.id)).map((s) => s.id);
    if (unaddressable.length)
      return {
        blocked:
          `${unaddressable.join(", ")}: this id cannot be switched off from the command line ` +
          "(a `-c` path addresses a bare TOML key), so exclusivity would be partial — rename " +
          "it in ~/.codex/config.toml, or disable it there for this session",
      };
    return {
      args: [
        // An entry that already IS us is left alone: we re-declare it just below, and two
        // `-c` writes to one server (a key, then the whole table) leave which one wins to
        // the parser rather than to us.
        ...own
          .filter((s) => s.url !== url)
          .flatMap((s) => ["-c", `mcp_servers.${s.id}.enabled=false`]),
        "-c",
        `mcp_servers.openmasq={url=${JSON.stringify(url)}}`,
      ],
    };
  },
};
