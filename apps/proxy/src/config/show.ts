// `openmasq-proxy config show|path|schema` — the effective configuration, and WHERE each
// value came from. It answers « why is it running at standard? » with a column rather than
// a guess: flag, env, the file's `clients.<tool>` block, its `run` block, or the default.
// It takes the same flags and `-- <tool>` as a run, so it shows the run that WOULD start.
import { DEFAULT_CONFIG_FILE } from "./file.js";
import { parseMcpPolicy, describePolicy } from "../features/mcp/policy.js";
import { editConfig, initConfig } from "./edit.js";
import { jsonSchema } from "./jsonSchema.js";
import { OPTIONS, type Option } from "./options.js";
import { type Io, parseConfig, type Parsed } from "./config.js";

export const CONFIG_USAGE = `openmasq-proxy config <command> [the run's own flags] [-- <tool>]

  show                   every setting, its value, and where it came from
  path                   the file that is (or would be) read
  init                   write an empty ~/.openmasq/proxy.json and its schema beside it
  edit                   open it in $VISUAL / $EDITOR, then check it
  schema                 print the JSON Schema of the file

  --json                 machine-readable output for show`;

/** A value as `show` prints it. The user's own sensitive lists are counted, not listed:
 *  \`always\` holds the very terms they never want on a screen. */
export function display(o: Option, config: Parsed["config"]): string {
  const v = (config as unknown as Record<string, unknown>)[o.key];
  if (o.kind === "always") return `${(v as unknown[]).length} term(s)`;
  if (o.name === "quiet") return String(!v); // the option is `quiet`, the field is `verbose`
  if (o.name === "mcpAdopt") return String(v);
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return v === "" ? "—" : String(v);
}

export interface ShowDeps extends Io {
  out?: (text: string) => void;
  err?: (text: string) => void;
  env?: NodeJS.ProcessEnv;
  /** `init`/`edit`'s file system and editor, injected by the tests (`edit.ts`). */
  files?: Partial<import("./edit.js").Files>;
  spawn?: import("./edit.js").Spawn;
}

export async function runConfigCommand(argv: string[], deps: ShowDeps = {}): Promise<number> {
  const out = deps.out ?? ((t) => console.log(t));
  const err = deps.err ?? ((t) => console.error(t));
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h" || command === "help") {
    out(CONFIG_USAGE);
    return command ? 0 : 2;
  }
  if (command === "schema") {
    out(JSON.stringify(jsonSchema(), null, 2));
    return 0;
  }
  const env = deps.env ?? process.env;
  const named = rest[rest.indexOf("--config") + 1] ?? "";
  const target = rest.includes("--config") ? named : (env.OPENMASQ_PROXY_CONFIG ?? "");
  if (command === "init") return initConfig(target, { out, err, ...deps.files });
  if (command === "edit")
    return editConfig(target, { out, err, env, ...deps.files, spawn: deps.spawn });
  const json = rest.includes("--json");
  const runArgs = rest.filter((a) => a !== "--json");
  let parsed: Parsed;
  let policy: ReturnType<typeof parseMcpPolicy> = {};
  try {
    parsed = parseConfig(runArgs, env, deps);
    // The run refuses a bad `mcp` section too, so `show` has to — a check that passes here
    // and fails on start would be no check.
    policy = parseMcpPolicy(parsed.file?.mcp ?? {}, `${parsed.file?.path} › mcp`);
  } catch (e) {
    err(e instanceof Error ? e.message : String(e));
    return 2;
  }
  if (command === "path") {
    const path = parsed.file?.path ?? DEFAULT_CONFIG_FILE();
    out(`${path}${parsed.file ? "" : " (absent — the defaults, env and flags apply)"}`);
    return 0;
  }
  if (command !== "show") {
    err(`unknown command ${command}\n\n${CONFIG_USAGE}`);
    return 2;
  }
  const rows = OPTIONS.map((o) => ({
    name: o.name,
    value: display(o, parsed.config),
    source: parsed.sources[o.name],
  }));
  if (json) {
    out(
      JSON.stringify(
        {
          file: parsed.file?.path ?? null,
          tool: parsed.config.command[0] ?? null,
          settings: rows,
          mcp: policy,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  const where = (s: string) =>
    s === "file" ? `file › run` : s === "client" ? `file › clients.${parsed.config.command[0]}` : s;
  out(parsed.file ? `file: ${parsed.file.path}` : `file: none (${DEFAULT_CONFIG_FILE()} absent)`);
  if (parsed.config.command.length) out(`tool: ${parsed.config.command.join(" ")}`);
  out("");
  const w = Math.max(...rows.map((r) => r.value.length), 5);
  for (const r of rows)
    out(`  ${r.name.padEnd(12)} ${r.value.padEnd(Math.min(w, 40))}  ${where(r.source)}`);
  for (const [id, p] of Object.entries(policy))
    out(`  mcp.${id.padEnd(8)} ${describePolicy(p).padEnd(Math.min(w, 40))}  file › mcp`);
  return 0;
}
