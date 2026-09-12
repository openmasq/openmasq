// `openmasq-proxy config show|path|schema` — the effective configuration, and WHERE each
// value came from. It answers « why is it running at standard? » with a column rather than
// a guess: flag, env, the file's `clients.<tool>` block, its `run` block, or the default.
// It takes the same flags and `-- <tool>` as a run, so it shows the run that WOULD start.
import { DEFAULT_CONFIG_FILE } from "./file.js";
import { OPTIONS, type Option } from "./options.js";
import { type Io, parseConfig, type Parsed } from "./config.js";

export const CONFIG_USAGE = `openmasq-proxy config <command> [the run's own flags] [-- <tool>]

  show                   every setting, its value, and where it came from
  path                   the file that is (or would be) read
  schema                 a JSON Schema for ~/.openmasq/proxy.json, for the editor

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

/** JSON Schema (draft 2020-12) for the file, from the table — never written by hand. */
export function jsonSchema(): Record<string, unknown> {
  const prop = (o: Option): Record<string, unknown> => {
    const base = { description: o.doc };
    switch (o.kind) {
      case "string":
        return { ...base, type: "string" };
      case "number":
        return { ...base, type: "integer", minimum: 1, maximum: 65535 };
      case "boolean":
        return { ...base, type: "boolean" };
      case "list":
        return { ...base, type: "array", items: { type: "string" } };
      case "enum":
        return { ...base, enum: [...o.values] };
      case "always":
        return {
          ...base,
          type: "array",
          items: {
            anyOf: [
              { type: "string", pattern: "^.+(:[a-z_]+)?$" },
              {
                type: "object",
                required: ["value"],
                properties: { value: { type: "string" }, category: { type: "string" } },
                additionalProperties: false,
              },
            ],
          },
        };
    }
  };
  const settings = {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(OPTIONS.filter((o) => o.file).map((o) => [o.name, prop(o)])),
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "openmasq-proxy configuration",
    type: "object",
    additionalProperties: false,
    properties: {
      $schema: { type: "string" },
      run: { ...settings, description: "the settings of every run — the flags, by name" },
      clients: {
        type: "object",
        description: "overrides by wrapped tool (claude, hermes, opencode…)",
        additionalProperties: settings,
      },
      mcp: {
        type: "object",
        description: "per-server policy: which side provides it, and how its results are masked",
        additionalProperties: { type: "object" },
      },
    },
  };
}

export interface ShowDeps extends Io {
  out?: (text: string) => void;
  err?: (text: string) => void;
  env?: NodeJS.ProcessEnv;
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
  const json = rest.includes("--json");
  const runArgs = rest.filter((a) => a !== "--json");
  let parsed: Parsed;
  try {
    parsed = parseConfig(runArgs, deps.env ?? process.env, deps);
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
        { file: parsed.file?.path ?? null, tool: parsed.config.command[0] ?? null, settings: rows },
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
  return 0;
}
