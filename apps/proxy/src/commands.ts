// The subcommands — `mcp`, `console`, `config` — behind one door, so each opens the same
// way: the masthead (`lib/ui/masthead.ts`), then its own lines. `server.ts` asks here first
// and starts the proxy only when nothing answered.
import { runConfigCommand } from "./config/show.js";
import { runConsoleCommand } from "./features/console/open.js";
import { runMcpCommand } from "./features/mcp/cli.js";
import { printMasthead } from "./lib/ui/masthead.js";

type Runner = (argv: string[], version: string) => Promise<number>;

const SUBCOMMANDS: Record<string, Runner> = {
  // The credential half: signs in, forgets, reports. Runs no server.
  mcp: (argv, version) => runMcpCommand(argv, version),
  // Opens the live view of the proxy already running — from any terminal, any tool.
  console: (argv) => runConsoleCommand(argv),
  // The run that WOULD start, where each value came from, the file itself.
  config: (argv) => runConfigCommand(argv),
};

/** `config show` — the verb the masthead names, when the first argument is one. */
const title = (name: string, rest: string[]): string =>
  rest[0] && !rest[0].startsWith("-") ? `${name} ${rest[0]}` : name;

/** Runs the subcommand named by `argv[0]`, or returns `undefined` when there is none. */
export async function runSubcommand(argv: string[], version: string): Promise<number | undefined> {
  const [name, ...rest] = argv;
  const run = name ? SUBCOMMANDS[name] : undefined;
  if (!run) return undefined;
  printMasthead(title(name, rest), version);
  return run(rest, version);
}
