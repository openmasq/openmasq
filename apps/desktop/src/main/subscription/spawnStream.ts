/**
 * The GENERIC loop of a headless CLI turn: spawn, NDJSON → actions, cancellation,
 * fail-closed. Extracted from `engine.ts` when the 2nd CLI (gemini) was wired in — rule 9
 * forbids copying a second one: each CLI only contributes its ARGS and its event
 * INTERPRETER, the skeleton lives here and nowhere else.
 *
 * FAIL-CLOSED: a CLI that's absent, unauthenticated, or that dies REJECTS. We never
 * return a silent empty stream, which would read as « the model didn't answer ».
 */
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { cliAuthWire, cliFailWire, type StreamDone, type StreamFinish, type TokenUsage } from "@openmasq/llm";
import { minimalChildEnv } from "../childEnv";
import { cliAuthFailureLine } from "./authFailure";
import { NdjsonLineBuffer } from "./claudeStream";
import type { SubscriptionCliId } from "./resolveCli";
import { argvOverBudget, launchFailure, spawnFailureCode } from "./spawnFailure";

/** What an interpreter surfaces. Everything else in the stream is deliberately ignored. */
export type CliAction =
  | { kind: "session"; id: string }
  | { kind: "text"; delta: string }
  | { kind: "reasoning"; delta: string }
  | { kind: "rateLimit"; status: string; resetsAt?: number; windowType?: string }
  | { kind: "done"; usage?: TokenUsage; finish: StreamFinish }
  /** `auth`: the CLI said so STRUCTURALLY (claude's `error: "authentication_failed"`) —
   *  otherwise the text alone is read (`authFailure.ts`). */
  | { kind: "error"; message: string; auth?: boolean };

function raise(err: Error): never {
  throw err;
}

/** Error carrying the CLI's error output, so the caller can translate it. `code:
 *  "cli_auth"` = the CLI's OWN session is missing or expired: the message then leads with
 *  the wire code (`cliAuthWire`), which is all that crosses to the renderer. */
export class SubscriptionCliError extends Error {
  constructor(
    message: string,
    readonly stderrTail: string,
    readonly exitCode: number | null,
    readonly code?: "cli_auth",
  ) {
    super(message);
    this.name = "SubscriptionCliError";
  }
}

/**
 * The failure of a turn, TYPED when it is a lost session. `evidence` is what is read for
 * it: the CLI's own error message, or its stderr on a non-zero exit. Anything else keeps
 * its message untouched — a quota, a refusal or a crash never becomes « sign in again ».
 */
export function cliFailure(
  cli: SubscriptionCliId,
  message: string,
  evidence: string,
  stderrTail: string,
  exitCode: number | null,
  structuredAuth = false,
): SubscriptionCliError {
  const line = cliAuthFailureLine(cli, evidence) ?? (structuredAuth ? evidence : null);
  return line === null
    ? new SubscriptionCliError(message, stderrTail, exitCode)
    : new SubscriptionCliError(cliAuthWire(cli, line), stderrTail, exitCode, "cli_auth");
}

export interface CliProcessOptions {
  /** Which CLI this is — what its failures are read against (`authFailure.ts`). */
  cli: SubscriptionCliId;
  binPath: string;
  args: string[];
  /** DEDICATED, neutral working directory — never a user folder. */
  cwd: string;
  /** Variables ADDED to the minimal environment (e.g. a neutral `GEMINI_CLI_HOME`). */
  extraEnv?: Record<string, string>;
  /** Written to the child's stdin, then closed — how a PROMPT travels when argv would cap
   *  it (`spawnFailure.ts`). Absent ⇒ stdin is `ignore` (codex blocks on an open stdin). */
  stdin?: string;
  /** Called ONCE, on the CLI's first output — it has read its inputs by then — and in any
   *  case when the turn ends: where a private input file is deleted (`privateFile.ts`). */
  onStarted?: () => void;
  /** JSON event (one NDJSON line) → action, or null (ignored). `sawDelta` lets an
   *  interpreter treat a final recap differently (claude pitfall #3). */
  interpret: (event: unknown, sawDelta: boolean) => CliAction | null;
  signal?: AbortSignal;
  onReasoning?: (delta: string) => void;
  /** SUBSCRIPTION quota reached — display as-is, never as a technical error. */
  onRateLimit?: (info: { status: string; resetsAt?: number; windowType?: string }) => void;
}

/**
 * One turn. Streams text deltas as they arrive and returns usage + the finish
 * reason, exactly like `streamAnthropic` in `@openmasq/llm` — so the wiring
 * in the provider layer is a simple switch.
 */
export async function* streamCliProcess(
  opts: CliProcessOptions,
): AsyncGenerator<string, StreamDone> {
  let startedFired = false;
  const started = () => {
    if (startedFired) return;
    startedFired = true;
    opts.onStarted?.();
  };
  // Refused BEFORE the spawn, in words: past the OS limit, `spawn` dies on « E2BIG ».
  if (argvOverBudget(process.platform, opts.binPath, opts.args)) {
    started();
    throw launchFailure(opts.cli, "prompt_too_long");
  }
  let child: ChildProcessByStdio<Writable | null, Readable, Readable>;
  try {
    child = spawnPiped(opts);
  } catch (err) {
    // macOS throws E2BIG synchronously (measured); other errnos arrive as `error` below.
    const errno = (err as NodeJS.ErrnoException).code;
    started();
    throw launchFailure(opts.cli, spawnFailureCode(errno), errno);
  }
  if (opts.stdin !== undefined && child.stdin) {
    child.stdin.on("error", () => {}); // a CLI that exits early closes the pipe: its exit says why
    child.stdin.end(opts.stdin, "utf8");
  }

  const onAbort = () => child.kill("SIGTERM");
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  const lines = new NdjsonLineBuffer();
  const pending: string[] = [];
  let sawDelta = false;
  let done: StreamDone | null = null;
  let failure: Error | null = null;
  let stderrTail = "";
  let resolveTick: (() => void) | null = null;

  const wake = () => {
    resolveTick?.();
    resolveTick = null;
  };

  const consume = (raw: string) => {
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      return; // a non-JSON line (startup noise) is not an error
    }
    const action = opts.interpret(event, sawDelta);
    if (!action) return;
    switch (action.kind) {
      case "text":
        sawDelta = true;
        pending.push(action.delta);
        break;
      case "reasoning":
        opts.onReasoning?.(action.delta);
        break;
      case "rateLimit":
        opts.onRateLimit?.(action);
        break;
      case "done":
        done = { usage: action.usage, finish: action.finish };
        break;
      case "error":
        failure = cliFailure(opts.cli, action.message, action.message, stderrTail, null, action.auth);
        break;
      case "session":
        break;
    }
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    started();
    for (const line of lines.push(chunk)) consume(line);
    wake();
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-2000);
  });

  const exited = new Promise<number | null>((resolve) => {
    child.on("error", (err: NodeJS.ErrnoException) => {
      const launch = launchFailure(opts.cli, spawnFailureCode(err.code), err.code);
      failure = new SubscriptionCliError(launch.message, stderrTail, null);
      resolve(null);
    });
    child.on("close", (code) => {
      for (const line of lines.flush()) consume(line);
      resolve(code);
    });
  });
  void exited.then(wake);

  let finished = false;
  void exited.then(() => {
    finished = true;
  });

  // A Stop (abort) kills the child with SIGTERM; some CLIs then emit one
  // last error event (« context canceled » on agy, measured) BEFORE
  // closing. This isn't a failure: the user cancelled — we return `cut`.
  const abortedCut = (): StreamDone | null =>
    opts.signal?.aborted ? { finish: "cut" } : null;

  try {
    while (true) {
      while (pending.length) yield pending.shift() as string;
      if (failure) return abortedCut() ?? raise(failure);
      if (finished) break;
      await new Promise<void>((r) => {
        resolveTick = r;
      });
    }

    const code = await exited;
    while (pending.length) yield pending.shift() as string;
    if (failure) return abortedCut() ?? raise(failure);

    if (opts.signal?.aborted) return { finish: "cut" };
    if (code !== 0 && !done) {
      const exit = `La CLI s'est arrêtée avec le code ${code ?? "inconnu"}.`;
      const err = cliFailure(opts.cli, exit, stderrTail, stderrTail, code);
      // A lost session keeps its own code; any other death is counted as `exit`.
      throw err.code ? err : new SubscriptionCliError(cliFailWire(opts.cli, "exit", exit), stderrTail, code);
    }
    // Clean exit but no `result`: the stream was cut, the response is truncated.
    return done ?? { finish: "cut" };
  } finally {
    started();
    opts.signal?.removeEventListener("abort", onAbort);
    if (!child.killed && child.exitCode === null) child.kill("SIGTERM");
  }
}

/** The spawn itself: stdin piped only when a prompt rides on it (stdout/stderr always). */
function spawnPiped(opts: CliProcessOptions): ChildProcessByStdio<Writable | null, Readable, Readable> {
  return spawn(opts.binPath, opts.args, {
    cwd: opts.cwd,
    env: { ...minimalChildEnv(), ...(opts.extraEnv ?? {}) },
    stdio: [opts.stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
  }) as ChildProcessByStdio<Writable | null, Readable, Readable>;
}
