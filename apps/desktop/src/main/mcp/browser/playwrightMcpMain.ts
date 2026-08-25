import { app } from "electron";

// Runs @playwright/mcp inside THIS app binary re-entered in "playwright-mcp mode"
// (B1: no ELECTRON_RUN_AS_NODE). Selected by the OPENMASQ_PWMCP env flag — NOT an argv
// script, because a PACKAGED Electron binary ignores an argv entry and would relaunch
// the normal app (which quits on the single-instance lock → the browser connector dies
// in production). Same env-branch pattern as the agent browser (see process.ts spawnArgs).
export function isPlaywrightMcpProcess(): boolean {
  return process.env.OPENMASQ_PWMCP === "1";
}

/** Entry for the re-entered playwright-mcp process. MUST run before the normal app init
 *  and MUST NOT write to stdout (the MCP stdio transport owns it for JSON-RPC). */
export function runPlaywrightMcpMain(): void {
  // Headless MCP server: no window, no Dock icon (a 2nd icon would otherwise show).
  if (process.platform === "darwin") app.dock?.hide();
  // SELF-TERMINATE when the parent goes away. This is a full Electron instance of the
  // SAME app bundle, so if it outlives main it makes Squirrel.Mac (ShipIt) count >1
  // running instance and abort the update swap ("App Still Running Error"). The parent
  // normally kills us via the MCP transport, but a HARD parent crash would only EOF our
  // stdin (the JSON-RPC channel) — so quit on that too, and on SIGTERM/SIGHUP.
  process.stdin.on("end", () => app.quit());
  process.stdin.on("close", () => app.quit());
  process.on("SIGTERM", () => app.quit());
  process.on("SIGHUP", () => app.quit());
  const cdpEndpoint = process.env.PLAYWRIGHT_MCP_CDP_ENDPOINT;
  const outputDir = process.env.OPENMASQ_PWMCP_OUTPUT_DIR;
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
