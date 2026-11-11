/**
 * A handler that FAILED BY ITS OWN FAULT, told apart from a refusal it worded.
 *
 * A throw inside an IPC body rejects the renderer's `invoke`, and stops there: main reports
 * nothing, so a fault of this process is seen only if the renderer happens to leave the
 * rejection unhandled. `guardFaults` hears it in main: a fault of the code (`TypeError`,
 * `ReferenceError`, `RangeError`, a failed assertion) or of the local database (`SQLITE_…`)
 * is reported ONCE per signature and session, then RETHROWN unchanged — the caller's answer
 * is what it was. A worded refusal is a plain `Error` and none of this.
 *
 * ⚠️ What is reported is the channel and the error, NEVER an argument (it can be a provider
 * key, a path, a message): the reporter takes no value from the call. The error's message
 * leaves only through `reduceMessage` (`@openmasq/analytics`). Pinned by `hostFault.test.ts`.
 *
 * No `electron`, no SDK: the reporter is handed in (`runtime/errorReport.ts`), so the IPC
 * floor stays testable alone.
 */
export function isHostFault(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err instanceof TypeError || err instanceof ReferenceError || err instanceof RangeError) return true;
  if (err.name === "AssertionError") return true;
  const code = (err as { code?: unknown }).code;
  return (typeof code === "string" && code.startsWith("SQLITE_")) || /^SQLITE_[A-Z_]+\b/.test(err.message);
}

type Reporter = (channel: string, err: unknown) => void;

/** Signatures already said this session; bounded, so a channel name can never grow it. */
const MAX_SIGNATURES = 500;
const MAX_WAITING = 16;
const said = new Set<string>();
const waiting: { channel: string; err: unknown }[] = [];
let reporter: Reporter | null = null;

function note(channel: string, err: unknown): void {
  try {
    if (!isHostFault(err)) return;
    const e = err as Error & { code?: unknown };
    const sig = `${channel}|${e.name}|${typeof e.code === "string" ? e.code : ""}`;
    if (said.has(sig) || said.size >= MAX_SIGNATURES) return;
    said.add(sig);
    if (reporter) reporter(channel, err);
    else if (waiting.length < MAX_WAITING) waiting.push({ channel, err });
  } catch {
    /* hearing a fault never creates one */
  }
}

/** Run a handler body; a host fault it throws or rejects with is noted, then rethrown. */
export function guardFaults<T>(channel: string, run: () => T): T {
  let out: T;
  try {
    out = run();
  } catch (err) {
    note(channel, err);
    throw err;
  }
  if (out && typeof (out as { then?: unknown }).then === "function") {
    return (out as unknown as Promise<unknown>).then(undefined, (err: unknown) => {
      note(channel, err);
      throw err;
    }) as unknown as T;
  }
  return out;
}

/** Wired once by `installErrorReporting`; faults heard before it are delivered then. */
export function setFaultReporter(fn: Reporter): void {
  reporter = fn;
  for (const w of waiting.splice(0)) fn(w.channel, w.err);
}

/** Tests only. */
export function resetHostFaults(): void {
  said.clear();
  waiting.length = 0;
  reporter = null;
}
