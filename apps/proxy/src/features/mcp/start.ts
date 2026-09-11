// Everything `--mcp` sets up before the proxy listens: which servers this run has, the
// connections to them, the bridge that masks their traffic, and — when a known client is
// being wrapped — the flags that make OUR endpoint its only MCP.
//
// It is startup work on purpose: an agent that lists tools on its first call must not wait
// on a login, and a servers file that cannot be read is an error the operator sees rather
// than a silent absence of tools.
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ProxyConfig } from "../../config/config.js";
import type { Masker } from "../../lib/masker.js";
import { createStore, providerFor } from "./auth.js";
import { createBridge, type McpBridge } from "./bridge.js";
import {
  CLIENT_IDS,
  detectClient,
  OUR_ID,
  soleServerConfig,
  type AgentClient,
  type OwnServer,
} from "./clients/index.js";
import { createConfirmer } from "./confirm.js";
import { notOurs, ownServers, probeRun } from "./own.js";
import { resolveSpecs } from "./resolve.js";
import type { ServerSpec } from "./servers.js";
import { connectUpstream, type Upstream } from "./upstream.js";

export interface StartDeps {
  config: ProxyConfig;
  masker: Masker;
  wrapping: boolean;
  note: (text: string, tone?: "info" | "warn" | "ok") => void;
  spinner: (text: string) => () => void;
  version: string;
}

export interface Integrations {
  upstream?: Upstream;
  bridge?: McpBridge;
  /** `id (n tools)` per connected server, for the card. */
  servers: string[];
  /** Appended to the wrapped client's argv — empty when there is nothing to force. */
  exclusiveArgs: string[];
  /** The client we forced, for the card. */
  clientId?: string;
  cleanup: () => void;
}

const NONE: Integrations = { servers: [], exclusiveArgs: [], cleanup: () => {} };

/**
 * Ask the client the SAME question a second time, under the configuration we just handed it,
 * and return what is still standing besides us. It fails CLOSED in both directions: a probe
 * that errors counts as "everything survived", because an unverifiable exclusivity is not one.
 */
function recheck(client: AgentClient, command: string, env?: Record<string, string>): string[] {
  if (!client.probe || !client.recheck) return [];
  try {
    return client.recheck(probeRun(command, client.probe.args, env), OUR_ID);
  } catch (err) {
    return [`the check could not be run (${err instanceof Error ? err.message : String(err)})`];
  }
}

export async function startIntegrations(deps: StartDeps): Promise<Integrations> {
  const { config } = deps;
  // With `-- <client>`, the point is that OUR endpoint becomes its ONLY MCP: an agent that
  // keeps its own connections reaches the service directly, with its own credential, and
  // nothing on that path is masked. `clients.ts` knows how to ask each client for that.
  const client = deps.wrapping ? detectClient(config.command[0]) : undefined;
  if (!config.mcp) return NONE;

  const url = `http://${config.host}:${config.port}`;
  // Our own config file, holding nothing but the loopback endpoint, for the length of the
  // run. The client's own files are never written to, so quitting restores it exactly.
  let tempDir = "";
  const cleanup = () => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  };

  // Exclusivity is decided BEFORE anything connects, because it decides adoption too: taking
  // a client's servers over while it still reaches them itself buys nobody anything.
  let exclusiveArgs: string[] = [];
  /** Set only once the client HAS been made exclusive — the flags can legitimately be empty
   *  (opencode's whole lever is an environment variable), so their count proves nothing. */
  let exclusive = false;
  let own: OwnServer[] | undefined;
  if (client) {
    tempDir = mkdtempSync(join(tmpdir(), "openmasq-mcp-"));
    const file = join(tempDir, "mcp.json");
    writeFileSync(file, soleServerConfig(url), { mode: 0o600 });
    const learned = ownServers(client, {
      command: config.command[0],
      cwd: process.cwd(),
      home: homedir(),
    });
    const endpoint = `${url}/mcp`;
    const outcome =
      "failed" in learned
        ? { blocked: `its own servers could not be listed (${learned.failed})` }
        : client.exclusive({
            configPath: file,
            dir: tempDir,
            url: endpoint,
            own: learned.own,
            env: process.env,
          });
    // A client that needs a file in its OWN shape asked for one; it lives beside ours, in the
    // directory that goes away with the run.
    if (!("blocked" in outcome) && outcome.write)
      writeFileSync(outcome.write.path, outcome.write.content, { mode: 0o600 });
    // …and the data it must keep (memory, skills, the credentials file) is linked in beside
    // that config, never copied — the real home stays untouched (see `Exclusivity.links`).
    if (!("blocked" in outcome) && outcome.links)
      for (const link of outcome.links)
        try {
          symlinkSync(link.target, link.path);
        } catch {
          /* a source that isn't there yet is not an error: Hermes creates it on demand */
        }
    // …and one whose only lever is an environment variable gets it here: `lib/wrap.ts` builds
    // the child's environment from ours, so this is where a variable reaches the client
    // without `runWrapped` having to know which client needs one.
    if (!("blocked" in outcome) && outcome.env)
      for (const [key, value] of Object.entries(outcome.env)) process.env[key] = value;
    const survivors =
      "blocked" in outcome || !client.recheck || !client.probe
        ? []
        : recheck(client, config.command[0], outcome.env);
    const verdict =
      survivors.length > 0
        ? {
            blocked:
              `${survivors.join(", ")} survived the configuration we hand it — something ` +
              "with more precedence declares it (a project file), so exclusivity would be " +
              "partial. Disable it there for this run",
          }
        : outcome;
    if ("blocked" in verdict)
      deps.note(
        `${client.id}: ${verdict.blocked}. Until then its OWN MCP servers stay on, and those ` +
          "tool calls do NOT pass through the mask.",
        "warn",
      );
    else {
      exclusiveArgs = verdict.args;
      exclusive = true;
      own = notOurs("own" in learned ? learned.own : [], endpoint);
    }
  }

  let specs: ServerSpec[] = [];
  try {
    specs = resolveSpecs({
      configPath: config.mcpConfig,
      ...(own ? { own } : {}),
      adopt: config.mcpAdopt,
      onAdopt: (id, scope) => deps.note(`taking ${id} over from ${client?.id} (${scope})`),
      onSkip: (id, why) => deps.note(`${id} not taken over: ${why}`, "warn"),
    });
  } catch (err) {
    cleanup();
    console.error(
      `${err instanceof Error ? err.message : String(err)}\n` +
        `Declare your MCP servers there (Claude Desktop's "mcpServers" shape), or drop --mcp.`,
    );
    process.exit(5);
  }

  // A client we cannot switch off is NAMED, because the user would otherwise believe its
  // tool calls are masked. Saying it is the whole mitigation available here.
  if (deps.wrapping && !client)
    deps.note(
      `${config.command[0]} is not one of ${CLIENT_IDS.join(", ")}: its OWN MCP servers stay on, ` +
        "and those tool calls do NOT pass through the mask. Point it at /mcp yourself and " +
        "switch its others off.",
      "warn",
    );

  const servers: string[] = [];
  const done = deps.spinner(`connecting ${specs.length} MCP server(s)…`);
  // The tokens `mcp login` stored. Silent: a startup reconnect refreshes from the file and
  // never opens a consent page — nobody asked for one, and it would steal the screen.
  const store = createStore();
  const upstream = await connectUpstream(specs, {
    oauth: (spec) =>
      store.loadOAuth(spec.id)
        ? providerFor(
            spec.id,
            `http://127.0.0.1:${store.loadPort(spec.id) ?? 0}/callback`,
            () => "",
            { store, note: deps.note },
            deps.version,
            spec,
          )
        : undefined,
    onUp: (id, tools) => servers.push(`${id} (${tools})`),
    onDown: (id, why) => deps.note(`${id} is not connected: ${why}`, "warn"),
  });
  done();

  const bridge = createBridge({
    upstream,
    masker: deps.masker,
    policy: config.mcpWrites,
    confirm: createConfirmer({ note: deps.note }),
  });

  return {
    upstream,
    bridge,
    servers,
    exclusiveArgs,
    // The card claims the client speaks to us and nobody else — only when it is true.
    ...(exclusive && client ? { clientId: client.id } : {}),
    cleanup,
  };
}
