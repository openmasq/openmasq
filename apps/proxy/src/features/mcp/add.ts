// `openmasq-proxy mcp add` — the form that fills `~/.openmasq/mcp.json`, and the writer that
// keeps that file's permissions right. It exists because the alternative is telling people to
// hand-write JSON holding an API key, next to a paragraph about which providers need a
// client id — a paragraph the CLI can replace by ASKING THE SERVER.
//
// The probe is the point: a server that registers clients on its own is never asked for a
// client id, and one that cannot (Google) is asked once, with its own advertised scopes
// offered as the default.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { probeServer } from "./probe.js";
import type { Prompt } from "./prompt.js";
import { parseServers, type ServerSpec } from "./servers.js";

/** The raw document, so an entry we do not understand survives a rewrite untouched. */
interface Doc {
  mcpServers: Record<string, unknown>;
}

export function readDoc(path: string): Doc {
  if (!existsSync(path)) return { mcpServers: {} };
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Doc>;
  return { mcpServers: (raw.mcpServers as Record<string, unknown>) ?? {} };
}

/** Write it back at 0600 — it holds API keys and client secrets (`servers.ts` refuses laxer). */
export function writeDoc(path: string, doc: Doc): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Validate the entry the way a start-up would, so a bad answer fails HERE and not at 8 a.m. */
export function validateEntry(id: string, entry: unknown): ServerSpec {
  const [spec] = parseServers(JSON.stringify({ mcpServers: { [id]: entry } }));
  if (!spec) throw new Error("the entry parsed to nothing");
  return spec;
}

export interface AddDeps {
  prompt: Prompt;
  path: string;
  say: (line: string) => void;
  probe?: typeof probeServer;
}

async function remoteEntry(deps: AddDeps): Promise<Record<string, unknown>> {
  const url = await deps.prompt.ask("URL", { required: true });
  const entry: Record<string, unknown> = { url };

  deps.say("  asking the server what it needs…");
  const probe = await (deps.probe ?? probeServer)(url);

  if (!probe.reachable) {
    deps.say(`  ${probe.note ?? "no OAuth metadata"}.`);
    if (await deps.prompt.confirm("Does it authenticate with a static header?", false)) {
      const name = await deps.prompt.ask("Header name", { default: "Authorization" });
      const value = await deps.prompt.secret(`${name} value`);
      entry.headers = { [name]: value };
    }
    return entry;
  }

  if (probe.dynamicRegistration) {
    deps.say("  it registers clients on its own — nothing to enter.");
    deps.say(`  finish with:  openmasq-proxy mcp login <name>`);
    return entry;
  }

  // No registration endpoint: the provider issues clients by hand, so we need one.
  deps.say(
    `  ${probe.authorizationServer ?? "its authorization server"} does not register clients,` +
      " so it needs one you created there.",
  );
  entry.clientId = await deps.prompt.ask("Client id", { required: true });
  const secret = await deps.prompt.secret("Client secret (empty for a public client)");
  if (secret) entry.clientSecret = secret;
  const scopes = await deps.prompt.ask("Scopes (space-separated)", {
    ...(probe.scopes.length ? { default: probe.scopes[0] } : {}),
  });
  if (scopes) entry.scopes = scopes;
  deps.say(
    "  register this redirect there:  http://127.0.0.1:<port>/callback" +
      "  (a desktop client accepts any loopback port)",
  );
  return entry;
}

async function stdioEntry(deps: AddDeps): Promise<Record<string, unknown>> {
  const command = await deps.prompt.ask("Command", { required: true, default: "npx" });
  const args = await deps.prompt.ask("Arguments (space-separated)");
  const entry: Record<string, unknown> = { command };
  if (args) entry.args = args.split(/\s+/).filter(Boolean);
  if (await deps.prompt.confirm("Does it need an API key in its environment?", false)) {
    const env: Record<string, string> = {};
    for (;;) {
      const name = await deps.prompt.ask("Variable name (empty to stop)");
      if (!name) break;
      env[name] = await deps.prompt.secret(`${name} value`);
    }
    if (Object.keys(env).length) entry.env = env;
  }
  return entry;
}

/** Run the form. Returns the id added, or "" when the user backed out. */
export async function runAdd(deps: AddDeps): Promise<string> {
  const doc = readDoc(deps.path);
  deps.say(`\nAdding a server to ${deps.path}\n`);

  const id = await deps.prompt.ask("Name (lowercase, no spaces)", { required: true });
  if (doc.mcpServers[id] && !(await deps.prompt.confirm(`${id} already exists — replace it?`)))
    return "";

  const kind = await deps.prompt.choose("What kind of server is it?", [
    ["remote", "remote — an https URL (Notion, Sentry, Gmail…)"],
    ["local", "local — a command this machine runs (a filesystem server, your own)"],
  ]);
  const entry = kind === "remote" ? await remoteEntry(deps) : await stdioEntry(deps);

  // Fail here rather than at the next start-up: the answers are still on screen.
  const spec = validateEntry(id, entry);
  doc.mcpServers[id] = entry;
  writeDoc(deps.path, doc);
  deps.say(`\n  ${id} written (${spec.transport}). ${deps.path} is 0600.`);
  return id;
}

/** Drop one entry. Returns false when it was not there. */
export function removeEntry(path: string, id: string): boolean {
  const doc = readDoc(path);
  if (!doc.mcpServers[id]) return false;
  delete doc.mcpServers[id];
  writeDoc(path, doc);
  return true;
}
