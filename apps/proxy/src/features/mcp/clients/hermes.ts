import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import type { AgentClient } from "./types.js";

/**
 * Hermes Agent (Nous Research). Its model base URL and its MCP servers both live in
 * `$HERMES_HOME/config.yaml`, and no env var redirects either; its single per-run lever is
 * `HERMES_HOME`, which relocates config AND memory/skills/credentials together.
 *
 * So exclusivity is a MIRRORED home: config.yaml is derived from the USER'S OWN with only two
 * changes — `model.base_url` redirected to the proxy, `mcp_servers` replaced by our endpoint
 * alone. Everything else in the home is SYMLINKED back from the real one: no secret is read
 * out, the real `~/.hermes` is never written. On quit the temp home is removed.
 *
 * Works with WHATEVER provider is connected: the base URL is redirected to the WIRE that
 * provider speaks (Anthropic and Gemini at the proxy's root, OpenAI-compatible at `/v1`),
 * and the proxy relays each wire to its own upstream with the caller's own auth.
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
 * the proxy and OUR endpoint as the only MCP server. Pure. `root` is `http://host:port`.
 * Comments are dropped (the temp config is ephemeral).
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
    // Mirror EVERY entry of the real home except config.yaml, so the run is the user's Hermes
    // in every way but the one file we own.
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
