// Abort helpers for the agentic MCP loop, pulled out of `mcpAgent.ts`.

/** An aborted `fetch` rejects with a DOMException whose name is "AbortError". */
export function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "AbortError";
}

/**
 * Reject as soon as `signal` aborts, so a blocking await inside the loop — a tool
 * dispatch (`client.callTool`) or a write-confirmation dialog — releases the loop
 * the instant Stop is pressed instead of holding it open until the await settles
 * on its own (an MCP call has no server cancel channel, a confirm dialog never
 * resolves). The underlying work may still finish in the background; its result is
 * simply dropped. Resolves normally when the promise wins the race.
 */
export function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    const done = () => signal.removeEventListener("abort", onAbort);
    promise.then(
      (v) => {
        done();
        resolve(v);
      },
      (e) => {
        done();
        reject(e);
      },
    );
  });
}
