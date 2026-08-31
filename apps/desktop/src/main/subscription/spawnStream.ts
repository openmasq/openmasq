/**
 * The GENERIC loop of a headless CLI turn: spawn, NDJSON → actions, cancellation,
 * fail-closed. Extracted from `engine.ts` when the 2nd CLI (gemini) was wired in — rule 9
 * forbids copying a second one: each CLI only contributes its ARGS and its event
 * INTERPRETER, the skeleton lives here and nowhere else.
 *
 * FAIL-CLOSED: a CLI that's absent, unauthenticated, or that dies REJECTS. We never
 * return a silent empty stream, which would read as « the model didn't answer ».
 */
import { spawn } from "node:child_process";
import type { StreamDone, StreamFinish, TokenUsage } from "@openmasq/llm";
import { minimalChildEnv } from "../childEnv";
import { NdjsonLineBuffer } from "./claudeStream";

/** What an interpreter surfaces. Everything else in the stream is deliberately ignored. */
export type CliAction =
  | { kind: "session"; id: string }
  | { kind: "text"; delta: string }
  | { kind: "reasoning"; delta: string }
  | { kind: "rateLimit"; status: string; resetsAt?: number; windowType?: string }
  | { kind: "done"; usage?: TokenUsage; finish: StreamFinish }
  | { kind: "error"; message: string };

function raise(err: Error): never {
  throw err;
}

/** Error carrying the CLI's error output, so the caller can translate it. */
export class SubscriptionCliError extends Error {
  constructor(
    message: string,
    readonly stderrTail: string,
    readonly exitCode: number | null,
  ) {
    super(message);
    this.name = "SubscriptionCliError";
  }
}

export interface CliProcessOptions {
  binPath: string;
  args: string[];
  /** DEDICATED, neutral working directory — never a user folder. */
  cwd: string;
  /** Variables ADDED to the minimal environment (e.g. a neutral `GEMINI_CLI_HOME`). */
  extraEnv?: Record<string, string>;
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
  const child = spawn(opts.binPath, opts.args, {
    cwd: opts.cwd,
    env: { ...minimalChildEnv(), ...(opts.extraEnv ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });

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
        failure = new SubscriptionCliError(action.message, stderrTail, null);
        break;
      case "session":
        break;
    }
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    for (const line of lines.push(chunk)) consume(line);
    wake();
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-2000);
  });

  const exited = new Promise<number | null>((resolve) => {
    child.on("error", (err) => {
      failure = new SubscriptionCliError(err.message, stderrTail, null);
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
      throw new SubscriptionCliError(
        `La CLI s'est arrêtée avec le code ${code ?? "inconnu"}.`,
        stderrTail,
        code,
      );
    }
    // Clean exit but no `result`: the stream was cut, the response is truncated.
    return done ?? { finish: "cut" };
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
    if (!child.killed && child.exitCode === null) child.kill("SIGTERM");
  }
}
