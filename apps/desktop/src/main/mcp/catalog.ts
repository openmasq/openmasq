import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/**
 * Vetted catalog of LOCAL (stdio) MCP servers. SECURITY: this is the *only* place
 * a runnable command lives. The renderer can never supply a command/args — it
 * references a catalog `id` and provides values for the **declared** env fields
 * only. Main maps the id → fixed command/args here, validates the env against the
 * schema (unknown keys are dropped, required keys enforced), and spawns WITHOUT a
 * shell (`@modelcontextprotocol/sdk` uses `spawn`, no shell interpolation). Secret
 * env values are encrypted at rest by `persist.ts` (safeStorage). Connecting runs
 * third-party code with the user's privileges — hence the curated allowlist.
 */
export interface StdioEnvField {
  key: string;
  label: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
}

/**
 * A user-granted path appended to the command's args (e.g. the filesystem
 * server's allowed root). SECURITY: a path is a capability grant, so the user
 * picks it via a native directory dialog and main re-validates it (absolute,
 * exists, is a directory) before spawning — never a free-text command/arg.
 */
export interface StdioParamField {
  key: string;
  label: string;
  kind: "directory";
  required?: boolean;
  /** Accept MANY grants (e.g. several allowed folders). The value is then a
   *  string[]; each is validated and appended as its own command arg. */
  multiple?: boolean;
}

/** A path-grant value: a single directory, or several when the field is `multiple`. */
export type StdioParamValue = string | string[];

export interface StdioCatalogEntry {
  id: string;
  name: string;
  desc: string;
  tone: string;
  /** Fixed executable + args — NOT overridable from the renderer. Inert when
   *  `inProcess` (kept only for the schema / any future spawnable entry). */
  command: string;
  args: string[];
  /** Runs IN-PROCESS (a `utilityProcess` worker, see `fs/connection.ts`), NOT as a
   *  spawned command — so `command`/`args` are never executed and the UI shows an
   *  « intégré à l'app » note instead of a shell line. */
  inProcess?: boolean;
  /** Declared env inputs; only these keys are ever passed to the process. */
  env: StdioEnvField[];
  /** User-granted path args appended after `args` (validated in main). */
  params?: StdioParamField[];
  /** One-time setup guidance shown in the UI. */
  note?: string;
  setupUrl?: string;
}

// Only **filesystem** ships for now. The other token-based local servers
// (Gmail/Slack/GitHub) needed a PAT / bot token — the app is moving to one-click
// OAuth (DCR) connectors instead, so they were removed until an OAuth path exists.
// Filesystem runs IN-PROCESS (`inProcess`, LocalFsConnection) — it does NOT spawn
// `@modelcontextprotocol/server-filesystem` (that npm dep was dropped); `command`/
// `args` are left empty since they are never executed for an in-process entry.
export const STDIO_CATALOG: StdioCatalogEntry[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    desc: "Lire/écrire des fichiers dans un dossier autorisé (serveur local)",
    tone: "amber",
    inProcess: true,
    command: "",
    args: [],
    env: [],
    params: [
      { key: "root", label: "Dossiers autorisés", kind: "directory", required: true, multiple: true },
    ],
    note: "L'accès se limite aux dossiers ci-dessus et à leurs sous-dossiers.",
    setupUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
  },
];

export function getCatalogEntry(id: string): StdioCatalogEntry | undefined {
  return STDIO_CATALOG.find((e) => e.id === id);
}

/** Renderer-facing metadata (the command is shown for transparency, never editable). */
export interface UiCatalogEntry extends Omit<StdioCatalogEntry, "command" | "args"> {
  /** Display-only command line for a SPAWNED entry; empty when `inProcess`. */
  commandLine: string;
}

export function catalogForUi(): UiCatalogEntry[] {
  return STDIO_CATALOG.map(({ command, args, ...rest }) => ({
    ...rest,
    // An in-process entry runs no external command → no shell line to show.
    commandLine: rest.inProcess
      ? ""
      : [command, ...args, ...(rest.params ?? []).map((p) => `<${p.label}>`)].join(" "),
  }));
}

/**
 * Resolve user-granted path params into extra command args. SECURITY: a path is a
 * capability grant, so each value MUST be an absolute path to an existing
 * directory (re-checked here in main, never trusted from the renderer). Returns
 * the validated args to append after the fixed `args`, plus any errors.
 */
export function resolveParams(
  entry: StdioCatalogEntry,
  provided: Record<string, StdioParamValue>,
): { args: string[]; errors: string[] } {
  const args: string[] = [];
  const errors: string[] = [];
  for (const field of entry.params ?? []) {
    const raw = provided[field.key];
    // A field may hold one grant (string) or many (string[] when `multiple`).
    const values = (Array.isArray(raw) ? raw : raw ? [raw] : [])
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) {
      if (field.required) errors.push(`${field.label} requis`);
      continue;
    }
    for (const value of values) {
      if (!isAbsolute(value)) {
        errors.push(`${field.label} doit être un chemin absolu`);
        continue;
      }
      const path = resolve(value); // normalises away any "." / ".." segments
      if (!existsSync(path) || !statSync(path).isDirectory()) {
        errors.push(`${field.label} : dossier introuvable`);
        continue;
      }
      args.push(path);
    }
  }
  return { args, errors };
}

/**
 * Build the spawn environment for a catalog entry from user-provided values.
 * SECURITY: starts from the SDK's filtered safe base env (PATH/HOME/… only), then
 * adds ONLY values for keys declared in the entry's schema — any extra keys in
 * `provided` are ignored. Returns the missing required keys (caller refuses to
 * connect if non-empty).
 */
export function buildEnv(
  entry: StdioCatalogEntry,
  provided: Record<string, string>,
): { env: Record<string, string>; missing: string[] } {
  const env: Record<string, string> = { ...getDefaultEnvironment() };
  const missing: string[] = [];
  for (const field of entry.env) {
    const value = provided[field.key];
    if (typeof value === "string" && value.trim()) env[field.key] = value;
    else if (field.required) missing.push(field.key);
  }
  return { env, missing };
}
