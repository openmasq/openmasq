/**
 * SSE reading — the ONE parser every consumer of a provider stream uses.
 *
 * Two shapes, one line-scanner, because the two callers genuinely differ: the CLIENT
 * consumes a live `Response` as it arrives ({@link readSSE}), while a SERVER that
 * proxied a stream through already holds the whole buffer and re-scans it afterwards
 * to meter it ({@link sseDataPayloads}). Before this file the second shape was
 * hand-rolled once per question asked of the buffer, and each copy re-decided what
 * counts as a data line — which is how one of them ends up trimming differently from
 * the parser that produced the counts it is compared against.
 */

/**
 * How long a live stream may say NOTHING before we declare it dead.
 *
 * ⚠️ This is the SECOND half of a watchdog pair, and it covers what the first cannot.
 * `mcpAgent`'s `TTFT_WATCHDOG_MS` (45 s) only watches for the FIRST token — a stream that
 * emits normally and then goes silent (a dropped TCP connection a proxy never RSTs, a
 * provider that stops mid-turn) sails past it and hangs FOREVER: `reader.read()` has no
 * timeout of its own, so before this the only way out was the user pressing Stop.
 *
 * Deliberately generous. Every provider sends something during a long turn (Anthropic
 * pings, OpenAI chunks), and a false abort costs a real answer, so this is a
 * last-resort backstop and NOT a latency budget — it must never be tuned down to
 * "responsiveness". The failure it replaces is an infinite hang, not a slow reply.
 */
export const SSE_IDLE_TIMEOUT_MS = 120_000;

/**
 * Race a pending read against the idle deadline.
 *
 * The rejection is deliberately a PLAIN `Error`, never an `AbortError`: the agent loop
 * treats `AbortError` as "the user pressed Stop" and finalises the turn SILENTLY
 * (`isAbortError`, `mcpAgentAbort.ts`), so a stall dressed as an abort would look to the
 * user like they had cancelled their own message. It must surface as a failure.
 */
function readBeforeIdle<T>(read: Promise<T>, idleMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Flux interrompu : aucune donnée reçue depuis ${Math.round(idleMs / 1000)} s ` +
              `(délai dépassé — stream idle timeout).`,
          ),
        ),
      idleMs,
    );
  });
  return Promise.race([read, idle]).finally(() => clearTimeout(timer));
}

/** The payload of one `data:` line, or undefined when the line isn't one. Everything
 *  here — the prefix, the single leading space SSE allows, `[DONE]` — is decided ONCE. */
function dataPayload(line: string): string | undefined {
  const t = line.trimEnd();
  if (!t.startsWith("data:")) return undefined;
  return t.slice(5).trimStart();
}

/**
 * Every JSON `data:` payload of a COMPLETE, already-buffered SSE text, in order.
 * `[DONE]` sentinels and blank payloads are dropped — a buffered scan is always
 * asking "what did the stream say", never "did it terminate".
 */
export function sseDataPayloads(sseText: string): string[] {
  const out: string[] = [];
  for (const line of sseText.split("\n")) {
    const payload = dataPayload(line);
    if (payload && payload !== "[DONE]") out.push(payload);
  }
  return out;
}

/**
 * Parse each JSON `data:` payload of a buffered SSE text, skipping the ones that
 * don't parse (a partial trailing frame, a keep-alive). The `try/catch` lives here
 * so no caller has to remember that a truncated stream ends mid-JSON.
 */
export function sseJsonEvents<T = unknown>(sseText: string): T[] {
  const out: T[] = [];
  for (const payload of sseDataPayloads(sseText)) {
    try {
      out.push(JSON.parse(payload) as T);
    } catch {
      /* partial / non-JSON keep-alive frame — ignore */
    }
  }
  return out;
}

/**
 * Stream a server-sent-events response, yielding the raw `data:` payload of each
 * event (one string per event). `[DONE]` sentinels are passed through VERBATIM here
 * — unlike the buffered scan — because a live consumer uses them to tell a clean end
 * from a dropped stream (`StreamFinish: "cut"`).
 *
 * A stream that goes silent for `idleMs` is treated as dead and throws (see
 * {@link SSE_IDLE_TIMEOUT_MS}). Pass `0` to disable — nothing does today, and a caller
 * that wants to should say why: the alternative to this timeout is an unbounded hang.
 * The deadline measures time spent WAITING ON THE NETWORK only; a slow consumer holds
 * the generator suspended at its `yield`, outside any read.
 */
export async function* readSSE(
  response: Response,
  signal?: AbortSignal,
  idleMs: number = SSE_IDLE_TIMEOUT_MS,
): AsyncGenerator<string> {
  if (!response.body) throw new Error("Response has no body to stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = idleMs > 0 ? await readBeforeIdle(reader.read(), idleMs) : await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line.
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        const dataLines = rawEvent
          .split("\n")
          .map(dataPayload)
          .filter((p): p is string => p !== undefined);

        if (dataLines.length > 0) {
          yield dataLines.join("\n");
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
