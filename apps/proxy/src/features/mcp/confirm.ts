// The confirmation, on the operator's terminal. The desktop app asks on a window the
// renderer cannot script; a CLI has no such surface, so the equivalent here is: the
// keystroke is read from the TTY itself, and NO TTY MEANS NO. A proxy running under a
// service manager, in CI, or behind `-- <tool>` cannot ask anyone — so it refuses writes
// rather than approving them on nobody's behalf.
//
// Two calls never share the prompt: they queue, because "y" typed at an ambiguous moment
// must not approve a call the operator never read.
import { colorsWanted, createTty, HUE_HEX, INK_HEX, type Tty } from "../../lib/ui/index.js";
import type { ConfirmAsk, ConfirmFn } from "./gate.js";

export interface ConfirmerOptions {
  /** Just the one line the prompt needs — not a whole Reporter, so the caller can be a
   *  wrapper that routes notes to the screen rather than to a log file. */
  note: (text: string, tone?: "info" | "warn" | "ok") => void;
  stdin?: NodeJS.ReadStream;
  /** No answer within this long ⇒ refused. A prompt nobody is watching must not hang the
   *  agent forever, and must not fall open when it gives up. */
  timeoutMs?: number;
  tty?: Tty;
  /** Injected by tests: read exactly one keypress. */
  readKey?: (timeoutMs: number) => Promise<string>;
}

/** The arguments as the real server will get them, on one bounded line. Never written to a
 *  file, never in `--json`: this is the screen of the person answering, and nothing else. */
export function argsPreview(args: unknown, max = 220): string {
  let text: string;
  try {
    text = JSON.stringify(args) ?? String(args);
  } catch {
    text = String(args);
  }
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** One keypress from a raw-mode TTY, or "" on timeout. Takes stdin over for the wait: the
 *  runtime keys (`l`, `m`, …) must not eat the answer, and the answer must not turn a dial. */
function readKeyFrom(stdin: NodeJS.ReadStream, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const others = stdin.listeners("data") as ((chunk: string) => void)[];
    for (const l of others) stdin.off("data", l);
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY && !wasRaw) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (key: string) => {
      clearTimeout(timer);
      stdin.off("data", onData);
      if (stdin.isTTY && !wasRaw) stdin.setRawMode(false);
      for (const l of others) stdin.on("data", l);
      resolve(key);
    };
    const onData = (chunk: string) => done(chunk);
    const timer = setTimeout(() => done(""), timeoutMs);
    timer.unref?.();
    stdin.on("data", onData);
  });
}

/**
 * Build the confirmer. `y` approves, anything else refuses — including a timeout, a Ctrl-C
 * and a stray newline. The asymmetry is the point: approval is one deliberate key.
 */
export function createConfirmer(opts: ConfirmerOptions): ConfirmFn {
  const stdin = opts.stdin ?? process.stdin;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const tty = opts.tty ?? createTty(colorsWanted());
  const readKey = opts.readKey ?? ((ms: number) => readKeyFrom(stdin, ms));
  const interactive = !!stdin.isTTY;
  let queue: Promise<unknown> = Promise.resolve();

  const ask = async (a: ConfirmAsk): Promise<boolean> => {
    if (!interactive) {
      opts.note(
        `${a.name} writes and there is no terminal to confirm it — refused. ` +
          `Run the proxy in its own window, or pass --mcp-writes allow knowingly.`,
        "warn",
      );
      return false;
    }
    const hue = a.risk === "high" ? HUE_HEX.amber : HUE_HEX.mint;
    opts.note("", "info");
    opts.note(
      `${tty.pill(hue, INK_HEX, a.risk === "high" ? "WRITE" : "write")} ${tty.bold(a.name)}`,
    );
    opts.note(`  ${tty.dim(argsPreview(a.args))}`);
    opts.note(`  ${tty.bold("y")} to run it, any other key to refuse`);
    const key = await readKey(timeoutMs);
    const ok = key.toLowerCase() === "y";
    opts.note(
      ok ? `${a.name} approved` : `${a.name} refused${key ? "" : " (no answer)"}`,
      ok ? "ok" : "warn",
    );
    return ok;
  };

  return (a: ConfirmAsk) => {
    const run = queue.then(() => ask(a));
    queue = run.catch(() => {});
    return run;
  };
}
