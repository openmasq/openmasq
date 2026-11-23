import { app } from "electron";
import { readSync } from "node:fs";
import { isLoopbackCdpEndpoint, readCdpPreamble } from "./cdpPreamble";

// Runs @playwright/mcp inside THIS app binary re-entered in "playwright-mcp mode"
// (B1: no ELECTRON_RUN_AS_NODE). Selected by the OPENMASQ_PWMCP env flag — NOT an argv
// script, because a PACKAGED Electron binary ignores an argv entry and would relaunch
// the normal app (which quits on the single-instance lock → the browser connector dies
// in production). Same env-branch pattern as the agent browser (see process.ts spawnArgs).
export function isPlaywrightMcpProcess(): boolean {
  return process.env.OPENMASQ_PWMCP === "1";
}

export { isLoopbackCdpEndpoint } from "./cdpPreamble";

/** Entry for the re-entered playwright-mcp process. MUST run before the normal app init
 *  and MUST NOT write to stdout (the MCP stdio transport owns it for JSON-RPC). */
export function runPlaywrightMcpMain(): void {
  // Headless MCP server: no window, no Dock icon (a 2nd icon would otherwise show).
  if (process.platform === "darwin") app.dock?.hide();
  // FIRST, before anything touches `process.stdin`: the endpoint line main writes ahead of
  // the JSON-RPC stream (`cdpPreamble.ts`). Consumed byte by byte, so the MCP server below
  // starts reading at `initialize`.
  const cdpEndpoint = readCdpPreamble((b) => readSync(0, b, 0, 1, null));
  // SELF-TERMINATE when the parent goes away. This is a full Electron instance of the
  // SAME app bundle, so if it outlives main it makes Squirrel.Mac (ShipIt) count >1
  // running instance and abort the update swap ("App Still Running Error"). The parent
  // normally kills us via the MCP transport, but a HARD parent crash would only EOF our
  // stdin (the JSON-RPC channel) — so quit on that too, and on SIGTERM/SIGHUP.
  process.stdin.on("end", () => app.quit());
  process.stdin.on("close", () => app.quit());
  process.on("SIGTERM", () => app.quit());
  process.on("SIGHUP", () => app.quit());
  const outputDir = process.env.OPENMASQ_PWMCP_OUTPUT_DIR;
  // A packaged build only ever DRIVES the app's own agent browser (a loopback CDP endpoint
  // main hands over): never a browser @playwright/mcp would launch for whoever preset the env.
  if (app.isPackaged && !isLoopbackCdpEndpoint(cdpEndpoint)) {
    process.stderr.write("[playwright-mcp] refused: no loopback CDP endpoint\n");
    app.exit(1);
    return;
  }
  // Use the PROGRAMMATIC API (config passed explicitly) rather than the CLI: a packaged
  // Electron mangles argv, so CLI-flag parsing (--cdp-endpoint/--output-dir) is
  // unreliable. Dynamic import so Playwright isn't statically bundled into the main
  // bundle (it's externalised, loaded from asar-unpacked node_modules at runtime).
  void (async () => {
    try {
      const { createConnection } = await import("@playwright/mcp");
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
      const server = await createConnection({
        browser: cdpEndpoint ? { cdpEndpoint } : undefined,
        ...(outputDir ? { outputDir } : {}),
      });
      await server.connect(new StdioServerTransport());
    } catch (err) {
      // Only ever to stderr — stdout is the JSON-RPC channel.
      process.stderr.write(`[playwright-mcp] failed to start: ${err instanceof Error ? err.stack : String(err)}\n`);
      app.exit(1);
    }
  })();
}
