import { app } from "electron";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

// ── Browser-agent opt-in flag ────────────────────────────────────────────────
// The controllable browser is OFF by default. Enabling it persists this flag so
// the connector re-lists on relaunch. Unlike the earlier single-process design,
// the agent browser now runs in a SEPARATE Electron process (see process.ts +
// agentMain.ts), spawned ON DEMAND — so enabling no longer needs an app restart,
// and the MAIN app never opens a CDP endpoint (no app-UI exposure).

const ENABLED_ENV = "OPENMASQ_BROWSER_AGENT";

function flagPath(): string {
  return join(app.getPath("userData"), "browser-agent.on");
}

export function isBrowserAgentEnabled(): boolean {
  if (process.env[ENABLED_ENV] === "1") return true;
  try {
    return readFileSync(flagPath(), "utf8").trim() === "1";
  } catch {
    return false;
  }
}

export function setBrowserAgentEnabled(on: boolean): void {
  try {
    if (on) writeFileSync(flagPath(), "1", "utf8");
    else rmSync(flagPath(), { force: true });
  } catch {
    // best effort — a failed write just means the feature stays off
  }
}
