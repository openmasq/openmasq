// The OAuth loopback answered ANY `GET /callback` on a port it deliberately keeps STABLE
// across connects (`persist.ts` savePort, so the registered redirect URI keeps matching).
// `http://127.0.0.1:<port>/callback` was therefore a guessable, long-lived local endpoint
// that any web page could hit with a bare `<img src="…/callback?error=x">` — no CORS to
// clear, no response to read — and that request settled the pending promise: the user's
// in-flight connector login died with a provider error it never got. A `?code=` would have
// resolved the flow with a code the page chose.
//
// The fix is the OAuth `state` (RFC 6749 §10.12): minted per attempt, sent in the
// authorize URL, echoed by the provider, and REQUIRED on the callback. The redirect URI
// itself stays `…/callback` — a binding in the path would change the URI on every attempt,
// which loopback clients are only guaranteed to tolerate for the port. These cases pin it.
import { describe, it, expect, vi } from "vitest";

vi.mock("./server/connectCancel", () => ({ connectSignal: () => undefined }));

import { startLoopback } from "./oauthLoopback";

/** A plain GET, the way a browser (or an `<img>`) would issue it. */
async function get(url: string): Promise<number> {
  const res = await fetch(url, { redirect: "manual" });
  await res.text();
  return res.status;
}

/** Resolved/rejected yet? Neither must happen for an unsolicited hit. */
function settleState(p: Promise<unknown>): Promise<"pending" | "resolved" | "rejected"> {
  return Promise.race([
    p.then(
      () => "resolved" as const,
      () => "rejected" as const,
    ),
    new Promise<"pending">((r) => setTimeout(() => r("pending"), 30)),
  ]);
}

describe("the OAuth loopback binds each attempt to its `state`", () => {
  it("keeps a STABLE redirect URI and mints a different, unguessable state per attempt", async () => {
    const a = await startLoopback();
    const b = await startLoopback();
    try {
      expect(a.redirectUrl).toBe(`http://127.0.0.1:${a.port}/callback`);
      expect(b.redirectUrl).toBe(`http://127.0.0.1:${b.port}/callback`);
      expect(a.state).toMatch(/^[A-Za-z0-9_-]{20,}$/);
      expect(a.state).not.toBe(b.state);
    } finally {
      a.close();
      b.close();
    }
  });

  it("404s a bare /callback?error=… (no state) and leaves the pending login ALIVE", async () => {
    const loop = await startLoopback();
    try {
      const pending = loop.waitForCode(5_000);
      pending.catch(() => {});
      expect(await get(`${loop.redirectUrl}?error=access_denied`)).toBe(404);
      expect(await settleState(pending)).toBe("pending");
    } finally {
      loop.close();
    }
  });

  it("404s a WRONG state too, and never resolves with the code it carried", async () => {
    const loop = await startLoopback();
    try {
      const pending = loop.waitForCode(5_000);
      pending.catch(() => {});
      expect(await get(`${loop.redirectUrl}?code=attacker&state=${loop.state}x`)).toBe(404);
      expect(await settleState(pending)).toBe("pending");
      // A wrong PATH with the right state settles nothing either.
      expect(await get(`http://127.0.0.1:${loop.port}/other?code=x&state=${loop.state}`)).toBe(404);
      expect(await settleState(pending)).toBe("pending");
    } finally {
      loop.close();
    }
  });

  it("resolves with the code when the state matches", async () => {
    const loop = await startLoopback();
    try {
      const pending = loop.waitForCode(5_000);
      expect(await get(`${loop.redirectUrl}?code=real-code&state=${loop.state}`)).toBe(200);
      await expect(pending).resolves.toBe("real-code");
    } finally {
      loop.close();
    }
  });

  it("still reports the provider's real error when the state matches", async () => {
    const loop = await startLoopback();
    try {
      const pending = loop.waitForCode(5_000);
      // Attach the expectation BEFORE the request: the rejection lands during the GET, and a
      // rejected promise with no handler for one microtask is an unhandled rejection.
      const rejected = expect(pending).rejects.toThrow(/access_denied — refus/);
      expect(
        await get(
          `${loop.redirectUrl}?error=access_denied&error_description=refus&state=${loop.state}`,
        ),
      ).toBe(200);
      await rejected;
    } finally {
      loop.close();
    }
  });

  it("fires onRedirect only for the attempt's own state", async () => {
    const onRedirect = vi.fn();
    const loop = await startLoopback(undefined, onRedirect);
    try {
      const pending = loop.waitForCode(5_000);
      pending.catch(() => {});
      await get(`${loop.redirectUrl}?code=x`);
      await get(`${loop.redirectUrl}?code=x&state=nope`);
      expect(onRedirect).not.toHaveBeenCalled();
      await get(`${loop.redirectUrl}?code=x&state=${loop.state}`);
      expect(onRedirect).toHaveBeenCalledTimes(1);
    } finally {
      loop.close();
    }
  });
});
