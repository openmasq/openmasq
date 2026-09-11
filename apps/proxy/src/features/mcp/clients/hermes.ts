import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { AgentClient } from "./types.js";

/**
 * Hermes Agent (Nous Research). Its model base URL and its MCP servers BOTH live in one place
 * only — `$HERMES_HOME/config.yaml` (`model.base_url`, `mcp_servers`); no env var redirects
 * either (verified in `hermes_cli/config.py`). Its single per-run lever is `HERMES_HOME`,
 * which relocates config AND the memory/skills/credentials with it.
 *
 * So exclusivity is a MIRRORED home: config.yaml is derived from the USER'S OWN (every setting
 * kept — provider, model, key, headers), with ONLY two changes — `model.base_url` redirected
 * to the proxy, and `mcp_servers` replaced by our endpoint alone (exclusive by construction).
 * Everything else in the home — `.env`, `memories/`, `skills/`, the code — is SYMLINKED back
 * from the real one. No secret is read out, the real `~/.hermes` is never written, the run
 * keeps its memory AND its own credentials. On quit the temp home is removed; unlinking a
 * symlink never touches its target.
 *
 * ⚠️ Works with WHATEVER provider is connected, because it keeps the user's provider and only
 * redirects the base URL to the WIRE that provider speaks: Anthropic (`/v1/messages`) and
 * Gemini reach the proxy at its root, an OpenAI-compatible provider at `/v1`. The proxy relays
 * each wire to its own upstream with the caller's own auth — the key is never touched.
 * Verified live end to end (OpenAI wire, fake upstream); the Anthropic wire is the same relay.
 */

/** Which base URL the proxy exposes for the wire this provider/model speaks. Anthropic posts
 *  to `<base>/v1/messages` and Gemini to `<base>/v1beta/…`, so they take the ROOT; an
 *  OpenAI-compatible client posts to `<base>/chat/completions`, so its base ends in `/v1`. */
export function wireBaseUrl(root: string, provider: unknown, model: unknown): string {
  const p = String(provider ?? "").toLowerCase();
  const m = String(model ?? "").toLowerCase();
  if (p === "anthropic" || p === "gemini" || /claude|gemini/.test(m)) return root;
  return `${root}/v1`;
}

/**
 * The config.yaml handed to Hermes: the user's own, with the model's base URL redirected to
 * the proxy and OUR endpoint as the only MCP server. Everything else the user set is kept
 * (provider, default model, api_key/auth, headers, custom_providers…). Pure — tested without a
 * filesystem. `root` is `http://host:port` (no path). Comments are dropped (the temp config is
 * ephemeral; the real one keeps them).
 */
export function hermesConfigFrom(userYaml: string, root: string): string {
  const doc = (parse(userYaml) ?? {}) as Record<string, unknown>;
  const model = (typeof doc.model === "object" && doc.model !== null ? doc.model : {}) as Record<
    string,
    unknown
  >;
  model.base_url = wireBaseUrl(root, model.provider, model.default ?? model.model);
  doc.model = model;
  doc.mcp_servers = { openmasq: { url: `${root}/mcp` } };
  return stringify(doc);
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
    let content: string;
    try {
      content = hermesConfigFrom(readFileSync(configPath, "utf8"), root);
    } catch {
      return { blocked: "~/.hermes/config.yaml could not be read as YAML" };
    }
    // Mirror EVERY entry of the real home except config.yaml — its memory, skills, sessions,
    // its `.env` and auth store, its own code/bin — so the run is the user's Hermes in every
    // way but the one file we own. Verified live: `hermes` runs from such a home.
    const links = readdirSync(home)
      .filter((name) => name !== "config.yaml")
      .map((name) => ({ path: join(dir, name), target: join(home, name) }));
    return {
      args: [],
      env: { HERMES_HOME: dir },
      write: { path: join(dir, "config.yaml"), content },
      links,
    };
  },
};
