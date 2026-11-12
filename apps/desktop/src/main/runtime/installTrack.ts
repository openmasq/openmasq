import type { TrackEvent } from "@openmasq/ui";
import type {
  SubscriptionCli,
  SubscriptionCliStatus,
  SubscriptionInstallProgress,
  SubscriptionSetupResult,
} from "@openmasq/llm";
import type { LoginEnd } from "../subscription/install/login";
import type { Progress } from "../python/runtime";

/**
 * What the app INSTALLS while it runs, as product events: a subscription CLI, its sign-in,
 * the Python runtime. The install modules stay free of the bridge; the IPC layer wraps each
 * call here with `reportMainEvent` (the `updates/track.ts` pattern), so this file is pure
 * and its tests need no Electron.
 *
 * Each install reports a START then a RESULT with the last phase it reached — an install
 * that never ends (the app quit mid-download, a sign-in page left open) is a start with no
 * result, never silence. Codes and phases only: never a path, URL, account or CLI output.
 */
export type Emit = (event: TrackEvent) => void;

type InstallEvent = Extract<TrackEvent, { name: "cli_install" }>;
type PythonEvent = Extract<TrackEvent, { name: "python_runtime" }>;

/** Telemetry never changes what an install returns or throws. */
function safe(emit: Emit, event: TrackEvent): void {
  try {
    emit(event);
  } catch {
    /* never throw from telemetry */
  }
}

/** Wrap one CLI install. `busy` (a second click on a running install) reports nothing:
 *  the running one already will. */
export async function trackCliInstall(
  cli: SubscriptionCli,
  emit: Emit,
  run: (onProgress: (p: SubscriptionInstallProgress) => void) => Promise<SubscriptionSetupResult>,
  now: () => number = Date.now,
): Promise<SubscriptionSetupResult> {
  const t0 = now();
  let stage: InstallEvent["stage"] = "start";
  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    safe(emit, { name: "cli_install_start", cli });
  };
  const result = await run((p) => {
    begin();
    stage = p.phase;
  });
  if (result.error === "busy") return result;
  begin();
  const outcome: InstallEvent["outcome"] = result.ok
    ? "ok"
    : result.error === "login" || !result.error
      ? "install"
      : result.error;
  safe(emit, { name: "cli_install", cli, outcome, stage, duration: now() - t0 });
  return result;
}

/** Wrap one sign-in. `start` returns `null` when this CLI has no sign-in to run. */
export async function trackCliLogin(
  cli: SubscriptionCli,
  emit: Emit,
  start: (onEnd: (end: LoginEnd) => void) => Promise<SubscriptionSetupResult> | null,
  now: () => number = Date.now,
): Promise<SubscriptionSetupResult | null> {
  const t0 = now();
  safe(emit, { name: "cli_login_start", cli });
  let end: LoginEnd | null = null;
  const done = start((e) => (end = e));
  if (!done) {
    safe(emit, { name: "cli_login", cli, outcome: "unsupported", url_shown: false, duration: 0 });
    return null;
  }
  const result = await done;
  const final: LoginEnd = end ?? { outcome: result.ok ? "ok" : "failed", urlShown: false };
  safe(emit, { name: "cli_login", cli, outcome: final.outcome, url_shown: final.urlShown, duration: now() - t0 });
  return result;
}

/** A sign-in asked for a CLI that is not on this machine. */
export function trackLoginWithoutCli(cli: SubscriptionCli, emit: Emit): void {
  safe(emit, { name: "cli_login_start", cli });
  safe(emit, { name: "cli_login", cli, outcome: "no_cli", url_shown: false, duration: 0 });
}

const seenStatus = new Set<string>();

/** Report what a set-up card read, once per distinct answer per session (cards re-read on
 *  every window focus). */
export function trackCliStatus(status: SubscriptionCliStatus | null, emit: Emit): void {
  if (!status) return;
  const logged_in = status.loggedIn === true ? "yes" : status.loggedIn === false ? "no" : "unknown";
  const key = `${status.cli}:${status.installed}:${logged_in}`;
  if (seenStatus.has(key)) return;
  seenStatus.add(key);
  safe(emit, { name: "cli_status", cli: status.cli, installed: status.installed, logged_in });
}

let pythonReported = false;
const pythonFailures = new Set<string>();

/** Wrap `ensureRuntime`: the source and duration of the FIRST success this session (later
 *  calls hit the in-memory promise), and each distinct failure stage. */
export async function trackPythonRuntime<T>(
  emit: Emit,
  ensure: (onProgress: (p: Progress) => void) => Promise<T>,
  onProgress?: (p: Progress) => void,
  now: () => number = Date.now,
): Promise<T> {
  const t0 = now();
  const phases = new Set<Progress["phase"]>();
  let stage: PythonEvent["stage"] = "start";
  const source = (): PythonEvent["source"] =>
    phases.has("download") ? "downloaded" : phases.has("install") ? "topped_up" : phases.has("ready") ? "bundled" : "cached";
  try {
    const out = await ensure((p) => {
      phases.add(p.phase);
      stage = p.phase;
      onProgress?.(p);
    });
    if (!pythonReported) {
      pythonReported = true;
      safe(emit, { name: "python_runtime", source: source(), outcome: "ok", stage: "ready", duration: now() - t0 });
    }
    return out;
  } catch (e) {
    if (!pythonFailures.has(stage)) {
      pythonFailures.add(stage);
      safe(emit, { name: "python_runtime", source: source(), outcome: "error", stage, duration: now() - t0 });
    }
    throw e;
  }
}

/** Tests only. */
export function resetInstallTracking(): void {
  seenStatus.clear();
  pythonFailures.clear();
  pythonReported = false;
}
