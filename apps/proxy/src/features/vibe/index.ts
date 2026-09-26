// Mistral Vibe, wrapped (`openmasq-proxy -- vibe`). Claude Code and Codex are pointed at the
// proxy by the three `*_BASE_URL` lines; Vibe reads none of them — its providers carry their
// own `api_base` — so its lever is its `VIBE_*` variables, which outrank its TOML files and
// leave them untouched. The MCP half (our endpoint as its only server) is `mcp/clients/vibe.ts`.
import { basename, resolve } from "node:path";
import { FAMILIES } from "../../lib/families.js";
import { readVibeFiles, userDisabledTools, type ReadDeps } from "./files.js";
import { vibePlan, type Upstreams } from "./routing.js";

export {
  readVibeFiles,
  mergedByName,
  userDisabledTools,
  vibeHome,
  type VibeFiles,
} from "./files.js";
export { routeBase, vibePlan, type Upstreams } from "./routing.js";

/** The session entry points Mistral's package (`mistral-vibe`, a PACKAGE name — `uvx --from
 *  mistral-vibe vibe` — never a command) installs; its app server takes no harness flag. */
const SESSION_BINS = new Set(["vibe", "vibe-acp"]);
const bin = (arg: string): string => basename(arg).replace(/\.(cmd|exe|bat)$/i, "");

/** Where Vibe's own argv starts — the command itself, or behind a launcher (`uvx … vibe`,
 *  `uv run vibe`, `python -m vibe`). A wrapper we do not see through is not Vibe to us, and
 *  says so at start (`mcp/start.ts`); the base URLs it gets are ignored by Vibe. */
export function vibeAt(command: string[]): number {
  if (SESSION_BINS.has(bin(command[0] ?? ""))) return 0;
  if (!/^(uvx|uv|pipx|python\d*(\.\d+)?|py)$/.test(bin(command[0] ?? ""))) return -1;
  return command.findIndex((a, i) => i > 0 && SESSION_BINS.has(bin(a)));
}
export const isVibe = (command: string[]): boolean => vibeAt(command) >= 0;

/** Flags that put Vibe where the proxy cannot follow: a worktree it creates, a harness whose
 *  routing is not open to reading. */
const REFUSED_FLAGS = ["--worktree", "--experimental-harness", "--smart-approve"];

/** What Vibe's own flags change about where it reads its configuration. */
function scopeOf(args: string[], cwd: string): { cwd: string; addDirs: string[] } | string {
  let dir = cwd;
  const addDirs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split(/=(.*)/s);
    const value = () => inline ?? args[++i] ?? "";
    if (REFUSED_FLAGS.includes(flag)) return flag;
    if (flag === "--workdir") dir = resolve(cwd, value());
    else if (flag === "--add-dir") addDirs.push(value());
  }
  return { cwd: dir, addDirs };
}

export interface ClientEnv {
  env: Record<string, string>;
  /** The command to run instead, when a flag must be added (right after Vibe's own name). */
  command?: string[];
  /** What to say on the card before the tool takes the screen. */
  notes: { text: string; tone: "info" | "warn" }[];
}

/**
 * The variables a wrapped client needs beyond the base URLs — or why the run must not start.
 * A client that needs none gets an empty set. Vibe's plan FAILS CLOSED: a config it cannot
 * read, a provider it cannot route, a flag that moves it out of sight, or a profile that
 * would outrank us, stops the run rather than let it go out in clear.
 */
export function clientEnv(
  command: string[],
  root: string,
  config: Upstreams,
  deps: { cwd?: string; env?: NodeJS.ProcessEnv; read?: ReadDeps; home?: string } = {},
): ClientEnv | { refuse: string } {
  const at = vibeAt(command);
  if (at < 0) return { env: {}, notes: [] };
  const env = deps.env ?? process.env;
  const args = command.slice(at + 1);
  const scope = scopeOf(args, deps.cwd ?? process.cwd());
  if (typeof scope === "string")
    return { refuse: `vibe: ${scope} takes Vibe where the proxy cannot follow — run it without` };
  const up = Object.fromEntries(FAMILIES.map((f) => [f, config[f]])) as Upstreams;
  let plan: ReturnType<typeof vibePlan>;
  try {
    plan = vibePlan(
      root,
      up,
      readVibeFiles(scope, env, deps.read, deps.home),
      userDisabledTools(env),
    );
  } catch (err) {
    return { refuse: `vibe: ${err instanceof Error ? err.message : String(err)}` };
  }
  if ("refuse" in plan) return { refuse: `vibe: ${plan.refuse}` };
  const notes: ClientEnv["notes"] = [];
  const masked = plan.routes.filter((r) => r.via !== "local" && r.via !== "blocked");
  const blocked = plan.routes.filter((r) => r.via === "blocked");
  if (masked.length)
    notes.push({
      text: `vibe: ${masked.map((r) => `${r.name} → /${r.via}`).join(", ")} (masked)`,
      tone: "info",
    });
  if (blocked.length)
    notes.push({
      text:
        `vibe: ${blocked.map((r) => r.name).join(", ")} — an upstream the proxy has no family ` +
        "for, so it is switched off for this run rather than sent in clear",
      tone: "warn",
    });
  notes.push({
    text:
      "vibe: text-to-speech, voice transcription, teleport, web search and telemetry are off " +
      "for this run (they would carry real values)",
    tone: "info",
  });
  notes.push({
    text:
      "vibe: a configuration your ORGANISATION enforces on Mistral's side outranks the proxy and " +
      "cannot be seen from here — if yours sets providers or MCP servers, they are not masked",
    tone: "warn",
  });
  // The legacy harness, whose routing is the one read above; a closed module switched on by a
  // remote rollout is not something the proxy can vouch for.
  // A subcommand (`vibe mcp add …`) is matched on argv[1] and starts no session.
  const legacy =
    args.includes("--legacy-harness") || args[0] === "mcp"
      ? command
      : [...command.slice(0, at + 1), "--legacy-harness", ...args];
  return { env: plan.env, command: legacy, notes };
}
