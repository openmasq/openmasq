import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentClient } from "./types.js";

/**
 * Hermes Agent (Nous Research). Its model base URL and its MCP servers BOTH live in one place
 * only — `$HERMES_HOME/config.yaml` (`model.base_url`, `mcp_servers`); no env var redirects
 * either (verified in `hermes_cli/config.py`: the base URL is read from config, not
 * `OPENAI_BASE_URL`). Its single per-run lever is `HERMES_HOME`, which relocates config AND
 * the memory/skills/credentials with it — the very thing `clients/index.ts` warns a home var
 * does.
 *
 * So exclusivity here is a MIRRORED home: config.yaml is OURS (the model routed through the
 * proxy, our endpoint as the only `mcp_servers` entry — exclusive by construction), and
 * everything that must survive — `.env` with the model key, `memories/`, `skills/`,
 * `sessions/` — is SYMLINKED back from the real home (`Exclusivity.links`). No secret is read,
 * the real `~/.hermes` is never written, and the run keeps its memory. On quit the temp home
 * (our config + the links) is removed; unlinking a symlink never touches its target.
 *
 * The model's API key rides via the symlinked `.env` (Hermes's own convention — « secrets go
 * in .env »): our config.yaml references it as `${OPENAI_API_KEY}` rather than copying it. A
 * user whose key is inline in `config.yaml` instead must move it to `.env` for this run — the
 * one thing this cannot carry without reading a secret.
 *
 * ⚠️ NOT verified live (Hermes not installed here). The mechanism is derived from the docs and
 * the source; the shape below is what a smoke test on a real account confirms.
 */

/** The data the temp home must keep — Hermes's `_HERMES_HOME_SUBDIRS` plus the `.env` that
 *  holds the model key. Linked, not copied. A missing source makes a dangling link, harmless. */
export const HERMES_CARRY = [
  ".env",
  "cron",
  "sessions",
  "logs",
  "memories",
  "pairing",
  "hooks",
  "image_cache",
  "audio_cache",
  "skills",
];

/** The config.yaml handed to Hermes: the model pointed at the proxy, and OUR endpoint as the
 *  only MCP server. Pure — tested without a filesystem. `root` is `http://host:port` (no path). */
export function hermesConfig(root: string, model?: string): string {
  return (
    [
      "model:",
      ...(model ? [`  default: ${JSON.stringify(model)}`] : []),
      "  provider: custom",
      `  base_url: ${JSON.stringify(`${root}/v1`)}`,
      "  api_key: ${OPENAI_API_KEY}",
      "mcp_servers:",
      "  openmasq:",
      `    url: ${JSON.stringify(`${root}/mcp`)}`,
    ].join("\n") + "\n"
  );
}

/** The user's default model, read from their `config.yaml` without a YAML dependency: the
 *  `default:` line inside the top-level `model:` block. Best-effort — absent ⇒ we omit it and
 *  Hermes falls back to its own default (or the user's `--model`, which outranks config). */
export function readDefaultModel(configYaml: string): string | undefined {
  let inModel = false;
  for (const line of configYaml.split(/\r?\n/)) {
    if (/^model:\s*(#.*)?$/.test(line)) {
      inModel = true;
      continue;
    }
    if (!inModel) continue;
    if (/^\S/.test(line)) break; // dedented — left the model block
    const m = /^\s+default:\s*(?:"([^"]+)"|'([^']+)'|([^"'#\s][^#]*?))\s*(?:#.*)?$/.exec(line);
    if (m) return (m[1] ?? m[2] ?? m[3])?.trim();
  }
  return undefined;
}

export const HERMES: AgentClient = {
  id: "hermes",
  exclusive: ({ url, dir, env }) => {
    const home = env.HERMES_HOME || join(homedir(), ".hermes");
    const configPath = join(home, "config.yaml");
    if (!existsSync(configPath))
      return {
        blocked:
          "Hermes is not set up (no ~/.hermes/config.yaml) — run `hermes setup` once, then it " +
          "can be wrapped",
      };
    // `ctx.url` is our /mcp endpoint; the model needs the ROOT, so strip the path.
    const root = url.replace(/\/mcp$/, "");
    let model: string | undefined;
    try {
      model = readDefaultModel(readFileSync(configPath, "utf8"));
    } catch {
      /* unreadable config → let Hermes use its own default */
    }
    return {
      args: [],
      env: { HERMES_HOME: dir },
      write: { path: join(dir, "config.yaml"), content: hermesConfig(root, model) },
      links: HERMES_CARRY.map((name) => ({ path: join(dir, name), target: join(home, name) })),
    };
  },
};
