// Everything `--mcp` sets up before the proxy listens: which servers this run has, the
// connections to them, the bridge that masks their traffic, and — when a known client is
// being wrapped — the flags that make OUR endpoint its only MCP. Startup work on purpose:
// an agent that lists tools on its first call must not wait on a login, and an unreadable
// servers file is an error the operator sees rather than a silent absence of tools.
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ProxyConfig } from "../../config/config.js";
import type { MaskerSet } from "../../lib/maskers.js";
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
import { endpointToken, endpointUrl } from "./endpointToken.js";
import { describePolicy, type McpPolicy } from "./policy.js";
import { createPolicyReload } from "./policyReload.js";
import { createSignal, type Signal, watchIntegrations } from "./reload.js";
import { openmasqDir } from "../../lib/stateDir.js";
import { createHash } from "node:crypto";
import { resolveSpecs } from "./resolve.js";
import type { ServerSpec } from "./servers.js";
import { connectUpstream, type Upstream } from "./upstream.js";
import { onPath } from "../../lib/wrap.js";

export interface StartDeps {
  config: ProxyConfig;
  maskers: MaskerSet;
  /** `proxy.json`'s `mcp` section, already validated. */
  policy: McpPolicy;
  wrapping: boolean;
  note: (text: string, tone?: "info" | "warn" | "ok") => void;
  spinner: (text: string) => () => void;
  version: string;
}

export interface Integrations {
  upstream?: Upstream;
  bridge?: McpBridge;
  /** `id (n)` per connected server, for the card — `id (n, strict, writes deny)` with a policy. */
  servers: string[];
  /** Appended to the wrapped client's argv — empty when there is nothing to force. */
  exclusiveArgs: string[];
  /** The client we forced, for the card. */
  clientId?: string;
  /** Fires when the tool list moved mid-run (`reload.ts`); `/mcp` tells the agent. */
  changes?: Signal;
  /** The key `/mcp` requires, and the endpoint carrying it — what the card prints and what a
   *  client is pointed at (`endpointToken.ts`). */
  token?: string;
  endpoint?: string;
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
  // Is there anything to wrap? Asked BEFORE the probe, so a tool that is not installed is
  // reported as such rather than as whatever fails first below.
  if (deps.wrapping && !onPath(config.command[0])) {
    console.error(
      `${config.command[0]}: not found on your PATH — there is nothing to wrap.\n` +
        `Install it, or give the full path to its binary.`,
    );
    process.exit(2);
  }
  // With `-- <client>`, OUR endpoint must become its ONLY MCP: an agent that keeps its own
  // connections reaches the service directly, unmasked. `clients.ts` knows how to ask each client.
  const client = deps.wrapping ? detectClient(config.command[0]) : undefined;
  if (!config.mcp) return NONE;

  const url = `http://${config.host}:${config.port}`;
  // The key to `/mcp`, read from the state directory or created there on first use. Minted
  // BEFORE anything is written for a client: the endpoint it is handed carries the token.
  const token = endpointToken();
  const endpoint = endpointUrl(url, token);
  // Our own config file, holding nothing but the loopback endpoint, for the length of the
  // run. The client's own files are never written to, so quitting restores it exactly.
  let tempDir = "";
  const cleanup = () => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  };

  // Exclusivity is decided BEFORE anything connects, because it decides adoption too.
  let exclusiveArgs: string[] = [];
  /** Set only once the client HAS been made exclusive — the flags can legitimately be empty
   *  (opencode's whole lever is an environment variable), so their count proves nothing. */
  let exclusive = false;
  let own: OwnServer[] | undefined;
  if (client) {
    tempDir = mkdtempSync(join(tmpdir(), "openmasq-mcp-"));
    const file = join(tempDir, "mcp.json");
    writeFileSync(file, soleServerConfig(endpoint), { mode: 0o600 });
    const learned = ownServers(client, {
      command: config.command[0],
      cwd: process.cwd(),
      home: homedir(),
    });
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

  // ONE resolution, run at start and again on every change of `~/.openmasq` (`reload.ts`):
  // same precedence, same policy, so a login made mid-run lands where a restart would put it.
  const resolve = (quiet = false) =>
    resolveSpecs({
      configPath: config.mcpConfig,
      ...(own ? { own } : {}),
      adopt: config.mcpAdopt,
      policy: deps.policy,
      onPolicy: (id, text, tone) => (quiet ? undefined : deps.note(`${id}: ${text}`, tone)),
      onAdopt: (id, scope) =>
        quiet ? undefined : deps.note(`taking ${id} over from ${client?.id} (${scope})`),
      onSkip: (id, why) => (quiet ? undefined : deps.note(`${id} not taken over: ${why}`, "warn")),
    });
  let specs: ServerSpec[] = [];
  try {
    specs = resolve();
  } catch (err) {
    cleanup();
    console.error(
      `${err instanceof Error ? err.message : String(err)}\n` +
        `Declare your MCP servers there (Claude Desktop's "mcpServers" shape), or drop --mcp.`,
    );
    process.exit(5);
  }

  // A client we cannot switch off is NAMED: saying it is the whole mitigation available here.
  if (deps.wrapping && !client)
    deps.note(
      `${config.command[0]} is not one of ${CLIENT_IDS.join(", ")}: its OWN MCP servers stay on, ` +
        "and those tool calls do NOT pass through the mask. Point it at /mcp yourself and " +
        "switch its others off.",
      "warn",
    );

  const servers: string[] = [];
  const done = deps.spinner(`connecting ${specs.length} MCP server(s)…`);
  // The tokens `mcp login` stored. Silent: a startup reconnect never opens a consent page.
  // The store is opened PER connection, so a login made in another process is seen by the
  // reconnect that follows it.
  const upstream = await connectUpstream(specs, {
    oauth: (spec) => {
      const store = createStore();
      return store.loadOAuth(spec.id)
        ? providerFor(
            spec.id,
            `http://127.0.0.1:${store.loadPort(spec.id) ?? 0}/callback`,
            () => "",
            { store, note: deps.note },
            deps.version,
            spec,
          )
        : undefined;
    },
    onUp: (id, tools) => {
      const policy = deps.policy[id] ? describePolicy(deps.policy[id]) : "";
      servers.push(`${id} (${tools}${policy ? `, ${policy}` : ""})`);
    },
    onDown: (id, why) => deps.note(`${id} is not connected: ${why}`, "warn"),
  });
  done();

  const bridge = createBridge({
    upstream,
    masker: deps.maskers.masker,
    policy: config.mcpWrites,
    confirm: createConfirmer({ note: deps.note }),
    // A server with an entry of its own: its results through its masker, its writes behind
    // its gate. The others fall through to the run's.
    perServer: (id) => ({
      masker: deps.maskers.forServer(id),
      ...(deps.policy[id]?.writes ? { writes: deps.policy[id].writes } : {}),
    }),
  });

  // A connection made through openmasq while this runs — `mcp login`, `mcp add`, an edited
  // servers file — reaches the agent now, not at the next start.
  const changes = createSignal();
  const reloader = watchIntegrations(specs, {
    dir: openmasqDir(),
    resolve: () => resolve(true),
    // A fingerprint of what the store holds for the id — a hash prefix, never the token —
    // so a fresh login on an already-declared server counts as a change.
    credentials: (id) => {
      const token = createStore().loadOAuth(id)?.tokens?.access_token;
      return token ? createHash("sha256").update(token).digest("hex").slice(0, 12) : "";
    },
    apply: (next, changed) => upstream.apply(next, changed),
    // `proxy.json`'s `mcp` section, and only that section (`policyReload.ts` says why).
    remask: createPolicyReload({ maskers: deps.maskers, policy: deps.policy, note: deps.note }),
    onChanged: (moved) => {
      deps.note(`integrations updated: ${moved.join(", ")} — the agent's tool list follows`, "ok");
      changes.emit();
    },
    note: deps.note,
  });

  return {
    upstream,
    bridge,
    servers,
    exclusiveArgs,
    // The card claims the client speaks to us and nobody else — only when it is true.
    ...(exclusive && client ? { clientId: client.id } : {}),
    token,
    endpoint,
    changes,
    cleanup: () => {
      reloader.close();
      cleanup();
    },
  };
}
