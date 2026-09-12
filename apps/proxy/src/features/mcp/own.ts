// How the proxy learns which MCP servers the wrapped client already has. It feeds BOTH
// halves of the feature — the exclusivity flags (`clients.ts`) and the adoption that keeps
// the session's integrations (`adopt.ts`) — and the two have different failure rules, which
// is why this returns an outcome rather than a list:
//
//   • a client whose exclusivity NAMES each server (Codex) needs a COMPLETE answer: one we
//     failed to enumerate is one that stays connected behind our back, so a probe that fails
//     is `failed`, and the caller drops exclusivity instead of half-applying it;
//   • a client with a real allow-list (Gemini CLI) only needs to find OURS, so an unreadable
//     file of theirs is simply nothing found.
//
// Nothing here writes: a declaration is read, a probe is the client's own read-only
// subcommand.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pick, type AgentClient, type OwnServer } from "./clients/index.js";

export type Own = { own: OwnServer[] } | { failed: string };

export interface OwnDeps {
  /** The command being wrapped — the binary a probe runs, never the client id (a user may
   *  well have `claude` on their PATH under another path than the one they typed). */
  command: string;
  cwd: string;
  home: string;
  read?: (path: string) => string;
  /** Run the client's own read-only subcommand and return its stdout. `env` carries what the
   *  run would add — `recheck` asks the SAME question under the flags we computed. */
  run?: (command: string, args: string[], env?: Record<string, string>) => string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `httpUrl` is Gemini CLI's spelling for an HTTP server; `parseServerMap` reads `url`. The
 *  entry is otherwise handed over exactly as its author wrote it. */
function normalize(raw: unknown): unknown {
  if (!isRecord(raw) || typeof raw.httpUrl !== "string" || raw.url !== undefined) return raw;
  const { httpUrl, ...rest } = raw;
  return { ...rest, url: httpUrl };
}

function urlOf(raw: unknown): string | undefined {
  if (!isRecord(raw)) return undefined;
  for (const key of ["url", "httpUrl"] as const) if (typeof raw[key] === "string") return raw[key];
  return undefined;
}

export function probeRun(command: string, args: string[], env?: Record<string, string>): string {
  const out = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 15_000,
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
  if (out.error) throw out.error;
  if (out.status !== 0) throw new Error(`exited ${out.status ?? "on a signal"}`);
  return out.stdout;
}

/**
 * The client's own servers, minus the one that IS us. Gemini CLI's exclusivity works over
 * what the user declared, so OUR endpoint sits in the very list we then take servers over
 * from — and adopting it would have the proxy connect to itself, re-exposing its own tools
 * under a second prefix on every start. `exclusive()` still sees the full list: it has to
 * find that entry, which is how it learns the name to allow.
 */
export function notOurs(own: OwnServer[], endpoint: string): OwnServer[] {
  // Compared WITHOUT the query string: our endpoint carries its token there, and a client
  // that declared it once (Gemini) may hold the bare form or an older one. Either is us.
  const bare = (u: string | undefined) => (u ?? "").split("?")[0];
  const ours = bare(endpoint);
  return own.filter((s) => bare(s.url) !== ours);
}

export function ownServers(client: AgentClient, deps: OwnDeps): Own {
  if (client.probe) {
    const run = deps.run ?? probeRun;
    try {
      return { own: client.probe.parse(run(deps.command, client.probe.args)) };
    } catch (err) {
      return {
        failed: `${[deps.command, ...client.probe.args].join(" ")} — ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  const read = deps.read ?? ((p: string) => readFileSync(p, "utf8"));
  const own: OwnServer[] = [];
  for (const declaration of client.declarations?.(deps.cwd, deps.home) ?? []) {
    let doc: unknown;
    try {
      doc = JSON.parse(read(declaration.path));
    } catch {
      // A missing or unfinished file is the normal case (no project config), not an event.
      continue;
    }
    const map = pick(doc, declaration.at);
    if (!isRecord(map)) continue;
    for (const [id, raw] of Object.entries(map)) {
      if (own.some((s) => s.id === id)) continue; // a duplicate id keeps its first scope
      own.push({ id, scope: declaration.scope, url: urlOf(raw), raw: normalize(raw) });
    }
  }
  return { own };
}
