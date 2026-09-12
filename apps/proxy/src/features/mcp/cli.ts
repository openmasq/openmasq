// `openmasq-proxy mcp <login|logout|status>` — the credential half of the CLI. It is here,
// and not in a separate tool, because the thing being authorised is the thing the proxy will
// connect to: one list of servers, one store, one command that fills it.
import { removeEntry, runAdd } from "./add.js";
import { homedir } from "node:os";
import { readConfigFile } from "../../config/file.js";
import { DEFAULTS } from "../../config/schema.js";
import { findRunning } from "../../lib/attach.js";
import { openmasqDir } from "../../lib/stateDir.js";
import { createStore, loginTo, type AuthDeps } from "./auth.js";
import { DECLARING_CLIENTS } from "./clients/index.js";
import { ownServers } from "./own.js";
import { describePolicy, type McpPolicy, parseMcpPolicy } from "./policy.js";
import { createPrompt } from "./prompt.js";
import { resolveSpecs } from "./resolve.js";
import { DEFAULT_MCP_CONFIG, type ServerSpec } from "./servers.js";

export const MCP_USAGE = `openmasq-proxy mcp <command>

  status                 the declared servers, and which are signed in
  add                    a form: declare a server, remote or local
  remove <server>        drop it from your servers file
  login <server>         sign in to a remote server in the system browser
  logout <server>        forget its tokens on this machine

  --config <file>        servers file (default ~/.openmasq/mcp.json)
  --no-adopt             ignore the servers Claude Code declares

Credentials live in ~/.openmasq: an AES-256-GCM store beside a 0600 key file. A local
server's API key stays in the servers file (0600, written by \`add\`); a remote server's OAuth
tokens are obtained by \`login\` and written to the store. Neither is ever handed to the agent.

\`add\` asks the SERVER what it needs: most remote ones register a client on their own and ask
you for nothing, so you only ever type a client id for a provider that issues them by hand
(Google's endpoints, whose authorization server publishes no registration endpoint).`;

interface Parsed {
  command: string;
  target: string;
  configPath: string;
  adopt: boolean;
}

export function parseMcpArgs(argv: string[]): Parsed {
  const out: Parsed = { command: argv[0] ?? "status", target: "", configPath: "", adopt: true };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config") out.configPath = argv[++i] ?? "";
    else if (a === "--no-adopt") out.adopt = false;
    else if (a === "--help" || a === "-h") out.command = "help";
    else if (!a.startsWith("-")) out.target = a;
    else throw new Error(`Unknown flag ${a}\n\n${MCP_USAGE}`);
  }
  return out;
}

const isHttp = (s: ServerSpec): boolean => s.transport === "http";

/** After a change to the servers or their credentials: a proxy already running reloads on
 *  its own (`reload.ts`), and the operator should know that no restart is needed. */
async function tellRunning(env = process.env): Promise<void> {
  const url = `http://127.0.0.1:${env.OPENMASQ_PROXY_PORT || DEFAULTS.port}`;
  const running = await findRunning(url);
  if (running) console.log(`  the proxy running on ${url} picks this up now — no restart needed.`);
}

/** Runs one `mcp` command. Returns the process exit code; prints its own lines. */
export async function runMcpCommand(
  argv: string[],
  version: string,
  note: AuthDeps["note"] = (t) => console.log(t),
): Promise<number> {
  let parsed: Parsed;
  try {
    parsed = parseMcpArgs(argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  if (parsed.command === "help") {
    console.log(MCP_USAGE);
    return 0;
  }

  // `add` writes the servers file; it must run BEFORE any attempt to READ it, or the very
  // first run fails on the file it exists to create.
  if (parsed.command === "add") {
    const path = parsed.configPath || DEFAULT_MCP_CONFIG;
    if (!process.stdin.isTTY) {
      console.error("add is a form — it needs a terminal. Edit the file directly otherwise.");
      return 2;
    }
    const prompt = createPrompt();
    try {
      const id = await runAdd({ prompt, path, say: (l) => console.log(l) });
      if (id) console.log(`  next:  openmasq-proxy mcp login ${id}`);
      await tellRunning();
      return 0;
    } catch (err) {
      console.error(`\n  ${err instanceof Error ? err.message : String(err)}`);
      return 5;
    } finally {
      prompt.close();
    }
  }

  const store = createStore();
  let specs: ServerSpec[];
  // The per-server policy of proxy.json, so `status` shows the run the proxy would start.
  let policy: McpPolicy = {};
  try {
    const file = readConfigFile("");
    if (file) policy = parseMcpPolicy(file.mcp, `${file.path} › mcp`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  try {
    // Every client whose servers can be read from a FILE. `status` must not run anybody's
    // binary, so a probe-only client (Codex) is not asked here — the running proxy asks it,
    // and only when that client is the one being wrapped.
    specs = resolveSpecs({
      configPath: parsed.configPath,
      own: DECLARING_CLIENTS.flatMap((client) => {
        const learned = ownServers(client, {
          command: client.id,
          cwd: process.cwd(),
          home: homedir(),
        });
        return "own" in learned ? learned.own : [];
      }),
      adopt: parsed.adopt,
      policy,
      onPolicy: (id, text) => console.log(`  ${id}: ${text}`),
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 5;
  }

  if (parsed.command === "status") {
    console.log(`credentials in ${openmasqDir()} (encrypted, key file 0600)\n`);
    if (!specs.length) {
      console.log("no servers declared — write ~/.openmasq/mcp.json, or run beside Claude Code.");
      return 0;
    }
    for (const s of specs) {
      const state = !isHttp(s)
        ? "local process — its key is in the servers file"
        : store.isAuthorized(s.id)
          ? "signed in"
          : s.transport === "http" && Object.keys(s.headers).length
            ? "static header — no login needed"
            : "NOT signed in — openmasq-proxy mcp login " + s.id;
      const rule = policy[s.id] ? describePolicy(policy[s.id]) : "";
      console.log(
        `  ${s.id.padEnd(16)} ${s.transport.padEnd(6)} ${state}${rule ? `  [${rule}]` : ""}`,
      );
    }
    return 0;
  }

  if (!parsed.target) {
    console.error(`${parsed.command} needs a server name.\n\n${MCP_USAGE}`);
    return 2;
  }

  if (parsed.command === "remove") {
    const path = parsed.configPath || DEFAULT_MCP_CONFIG;
    // Its tokens go with it: leaving them behind would hide a live grant behind a server
    // the user believes they deleted.
    const hadTokens = store.forget(parsed.target);
    const removed = removeEntry(path, parsed.target);
    console.log(
      removed || hadTokens
        ? `${parsed.target}: removed${hadTokens ? " (tokens forgotten too)" : ""}.`
        : `${parsed.target}: not declared.`,
    );
    if (removed || hadTokens) await tellRunning();
    return 0;
  }
  const spec = specs.find((s) => s.id === parsed.target);

  if (parsed.command === "logout") {
    // Forgetting works even for a server no longer declared: the tokens outlive the
    // declaration, and leaving them behind because the entry was deleted would be the wrong
    // way round.
    const forgotten = store.forget(parsed.target);
    console.log(
      forgotten
        ? `${parsed.target}: forgotten on this machine.`
        : `${parsed.target}: nothing stored.`,
    );
    if (forgotten) await tellRunning();
    return 0;
  }

  if (parsed.command !== "login") {
    console.error(`Unknown command ${parsed.command}\n\n${MCP_USAGE}`);
    return 2;
  }
  if (!spec) {
    console.error(
      `${parsed.target} is not declared. Known: ${specs.map((s) => s.id).join(", ") || "(none)"}`,
    );
    return 5;
  }
  if (spec.transport !== "http") {
    console.error(`${spec.id} is a local process: its credentials go in the servers file.`);
    return 2;
  }
  try {
    await loginTo(spec, { store, note }, version);
    await tellRunning();
    return 0;
  } catch (err) {
    console.error(`${spec.id}: ${err instanceof Error ? err.message : String(err)}`);
    return 6;
  }
}
