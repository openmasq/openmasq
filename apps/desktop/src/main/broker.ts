import { app, utilityProcess, type UtilityProcess } from "electron";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { minimalChildEnv } from "./childEnv";
import { reportMainError } from "./runtime/errorReport";
import { isAppQuitting } from "./runtime/quitState";
import { BRAND } from "@openmasq/branding";
import { devOnly } from "./security/devOnly";


/**
 * Runs the `@openmasq/mcp-broker` MCP broker as a local **sidecar** (loopback only).
 * The broker hosts per-platform MCP servers + its OAuth AS with the app's shared
 * provider keys; each user's upstream tokens stay on this machine, encrypted in
 * `${userData}/broker`. The renderer connects to `${url}/<platform>/mcp` through
 * the existing HTTP+OAuth connector flow.
 *
 * Run via `utilityProcess.fork` (a Node child NOT gated by the `RunAsNode` fuse, unlike
 * `ELECTRON_RUN_AS_NODE` — audit B1). Best-effort: if
 * the broker build is missing or it fails to come up, the rest of the app is
 * unaffected and the MCP tab simply omits the broker section.
 */
interface BrokerState {
  url: string;
  platforms: { id: string; name: string; desc: string; mcpUrl: string }[];
}

let child: UtilityProcess | undefined;
let state: BrokerState | undefined;

/** Resolve the built broker entry (override with OPENMASQ_BROKER_ENTRY). */
function brokerEntry(): string | undefined {
  // DEV-ONLY: in a packaged build this path is forked as the signed app, so honouring
  // it would be arbitrary code execution under the app's identity and TCC grants.
  const override = devOnly(process.env.OPENMASQ_BROKER_ENTRY);
  if (override) return existsSync(override) ? override : undefined;
  // dev: app path is apps/desktop → ../../apps/mcp-broker/dist/index.js
  const dev = join(app.getAppPath(), "..", "..", "apps", "mcp-broker", "dist", "index.js");
  return existsSync(dev) ? dev : undefined;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function waitHealthy(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export async function startBroker(): Promise<void> {
  if (child) return;
  const entry = brokerEntry();
  if (!entry) {
    console.warn("[broker] build not found — run `pnpm --filter @openmasq/mcp-broker build`. Skipping sidecar.");
    return;
  }
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  // Run the broker via `utilityProcess.fork` (a Node child) instead of
  // `ELECTRON_RUN_AS_NODE` (audit B1): utilityProcess is NOT gated by the `RunAsNode`
  // fuse, so this removes the last consumer of run-as-node and lets the fuse be turned
  // off. The broker is a plain HTTP server (main talks to it over loopback HTTP, not
  // stdio), so no MessagePort protocol is needed — just run it and poll /healthz.
  child = utilityProcess.fork(entry, [], {
    serviceName: `${BRAND.slug}-broker`,
    // Allow-list, never inheritance: the broker is a THIRD-PARTY closure that holds
    // OAuth tokens — the user's shell env has no business reaching it (childEnv.ts).
    env: minimalChildEnv({
      BROKER_FORCE_LISTEN: "1",
      PORT: String(port),
      PUBLIC_URL: url,
      BROKER_DATA_DIR: join(app.getPath("userData"), "broker"),
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => console.log(`[broker] ${String(d).trimEnd()}`));
  child.stderr?.on("data", (d) => console.error(`[broker] ${String(d).trimEnd()}`));
  const proc = child;
  child.on("exit", (code) => {
    if (code) console.error(`[broker] exited with code ${code}`);
    // An unexpected POST-STARTUP death (stopBroker detaches `child` before killing, the
    // app's shutdown goes through `isAppQuitting`) used to be console-only — so invisible
    // for a user, even though all their broker connectors die with it (audit 13/08).
    if (child === proc && !isAppQuitting()) {
      reportMainError("mcp", `broker-exit-${code ?? "?"}`, new Error(`mcp-broker mort (code ${code})`));
    }
    child = undefined;
    state = undefined;
  });

  if (!(await waitHealthy(url, 10_000))) {
    console.error("[broker] did not become healthy in time");
    reportMainError("mcp", "broker-unhealthy", new Error("broker did not become healthy in time"));
    stopBroker();
    return;
  }
  try {
    const platforms = (await (await fetch(`${url}/platforms`)).json()) as BrokerState["platforms"];
    state = { url, platforms };
    console.log(`[broker] ready at ${url} (${platforms.map((p) => p.id).join(", ")})`);
  } catch (err) {
    console.error("[broker] could not read platforms:", err);
    reportMainError("mcp", "broker-platforms", err);
    state = { url, platforms: [] };
  }
}

/** Stop the broker sidecar. Resolves once the utility child has exited (or a short
 *  timeout), so the update flow can await a clean teardown before quitAndInstall. (A
 *  utilityProcess runs as a helper, not a distinct app-bundle instance, so it doesn't
 *  affect ShipIt's running-instance count — this is teardown hygiene.) */
export function stopBroker(): Promise<void> {
  const proc = child;
  child = undefined;
  state = undefined;
  if (!proc) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const hard = setTimeout(resolve, 2000);
    proc.once("exit", () => { clearTimeout(hard); resolve(); });
    try { proc.kill(); } catch { clearTimeout(hard); resolve(); }
  });
}

/** The running broker's URL + platforms, or null if it isn't up. */
export function getBroker(): BrokerState | null {
  return state ?? null;
}
