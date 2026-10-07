import { reportMainError } from "../../runtime/errorReport";
import { isAppQuitting } from "../../runtime/quitState";

/**
 * Report a MID-SESSION death of the agent-browser child — a crash, never a deliberate quit.
 * Exit code 0 is the child's own Electron app quitting cleanly (its app menu / ⌘Q while its
 * window has focus, an OS logout): `agentMain.ts` keeps it alive through uncaught errors and
 * `window-all-closed`, so nothing else ends it with 0. The caller resets its state either way,
 * and the next use respawns the child. A signal (`code === null`) or a non-zero code IS reported.
 */
export function reportAgentExit(transport: "pipe" | "port", code: number | null): void {
  if (code === 0 || isAppQuitting()) return;
  reportMainError("browser", `agent-exit-${code ?? "?"}`, new Error(`agent browser (${transport}) mort (code ${code})`));
}
