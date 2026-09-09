// Everything `--mcp` sets up before the proxy listens: which servers this run has, the
// connections to them, the bridge that masks their traffic, and — when a known client is
// being wrapped — the flags that make OUR endpoint its only MCP.
//
// It is startup work on purpose: an agent that lists tools on its first call must not wait
// on a login, and a servers file that cannot be read is an error the operator sees rather
// than a silent absence of tools.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ProxyConfig } from "../../config/config.js";
import type { Masker } from "../../lib/masker.js";
import { createStore, providerFor } from "./auth.js";
import { createBridge, type McpBridge } from "./bridge.js";
import { CLIENT_IDS, detectClient, soleServerConfig } from "./clients.js";
import { createConfirmer } from "./confirm.js";
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

export async function startIntegrations(deps: StartDeps): Promise<Integrations> {
  const { config } = deps;
  // With `-- <client>`, the point is that OUR endpoint becomes its ONLY MCP: an agent that
  // keeps its own connections reaches the service directly, with its own credential, and
  // nothing on that path is masked. `clients.ts` knows how to ask each client for that.
  const client = deps.wrapping ? detectClient(config.command[0]) : undefined;
  if (!config.mcp) return NONE;

  let specs: ServerSpec[] = [];
  try {
    specs = resolveSpecs({
      configPath: config.mcpConfig,
      ...(client ? { client } : {}),
      adopt: config.mcpAdopt,
      cwd: process.cwd(),
      home: homedir(),
      onAdopt: (id, scope) => deps.note(`taking ${id} over from ${client?.id} (${scope})`),
      onSkip: (id, why) => deps.note(`${id} not taken over: ${why}`, "warn"),
    });
  } catch (err) {
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

  let tempDir = "";
  let exclusiveArgs: string[] = [];
  if (client) {
    // Our own config file, holding nothing but the loopback endpoint, for the length of the
    // run. The client's own files are never written to, so quitting restores it exactly.
    tempDir = mkdtempSync(join(tmpdir(), "openmasq-mcp-"));
    const file = join(tempDir, "mcp.json");
    writeFileSync(file, soleServerConfig(`http://${config.host}:${config.port}`), { mode: 0o600 });
    exclusiveArgs = client.exclusiveArgs(file);
  }

  return {
    upstream,
    bridge,
    servers,
    exclusiveArgs,
    ...(client ? { clientId: client.id } : {}),
    cleanup: () => {
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
