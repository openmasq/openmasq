import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { DEFAULTS } from "../config/config";
import { silentReporter } from "./ui";
import type { Masker } from "./masker";

/*
 * ⚠️ THE PROXY MUST NOT DISAPPEAR. While it runs, it is somebody's only way to reach a
 * model — a wrapped tool was launched pointing at it and dies with it.
 *
 * An upstream that goes away MID-STREAM (a laptop losing wifi, a provider dropping the
 * connection) errors the response body. A chain of `.pipe()` does not forward that error, so
 * it landed on a `Readable` nobody listened to and Node turned it into an uncaught exception:
 * the whole process exited, in the middle of somebody's session. `pipeline` is what makes the
 * failure arrive somewhere.
 */
const NEVER_MASKS = {
  mask: async (text: string) => ({ text, matches: [] }),
  restoreReply: (t: string) => t,
  restoreArgs: (t: string) => t,
} as unknown as Masker;

/** An upstream that opens an SSE stream, sends a frame, then fails the way undici reports a
 *  dropped connection: a bare « terminated » whose `cause` carries the real reason. */
const droppingUpstream = (afterMs = 10) =>
  (async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("event: message_start\ndata: {}\n\n"));
          setTimeout(
            () =>
              c.error(
                Object.assign(new Error("terminated"), { cause: new Error("read EHOSTUNREACH") }),
              ),
            afterMs,
          );
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )) as unknown as typeof fetch;

let server: Server | undefined;
afterEach(() => server?.close());

function start(fetchFn: typeof fetch, notes: string[] = []): Promise<string> {
  const app = createApp({
    config: { ...DEFAULTS },
    masker: NEVER_MASKS,
    reporter: { ...silentReporter, note: (t: string) => void notes.push(t) },
    version: "test",
    fetch: fetchFn,
    modelOn: () => false,
  });
  return new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`),
    );
    server = s;
  });
}

const ask = (base: string) =>
  fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "m", stream: true, messages: [{ role: "user", content: "hi" }] }),
  });

describe("an upstream that dies mid-stream", () => {
  it("does not take the proxy down with it", async () => {
    const notes: string[] = [];
    const base = await start(droppingUpstream(), notes);
    // The read fails — that IS what happened, and the client can retry it.
    await expect(ask(base).then((r) => r.text())).rejects.toThrow();

    // THE assertion: the process is still here and still serving. A crashed proxy would
    // never reach this line, and a wrapped tool would already be gone.
    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
  });

  it("says so on the operator's screen — a silent truncation looks like an answer", async () => {
    const notes: string[] = [];
    const base = await start(droppingUpstream(), notes);
    await ask(base)
      .then((r) => r.text())
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    // The reason undici hides in `cause` is the one worth printing.
    expect(notes.join(" ")).toMatch(/ended early/);
    expect(notes.join(" ")).toMatch(/EHOSTUNREACH/);
  });

  /** The same failure BEFORE any byte leaves has a status left to use, and must not be
   *  confused with the truncation above. */
  it("answers a clean error when the upstream never responds at all", async () => {
    const base = await start((async () => {
      throw Object.assign(new Error("terminated"), { cause: new Error("read EHOSTUNREACH") });
    }) as unknown as typeof fetch);
    const r = await ask(base);
    expect(r.status).toBe(502);
    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
  });
});
