import { describe, it, expect } from "vitest";
import { withConnect, cancelConnect, connectSignal } from "./server/connectCancel";
import { startLoopback } from "./oauthLoopback";

describe("connectCancel — the ambient cancellation scope", () => {
  it("exposes no signal outside a connect scope", () => {
    expect(connectSignal()).toBeUndefined();
  });

  it("carries a live (non-aborted) signal inside the scope, across awaits", async () => {
    await withConnect("a", async () => {
      const sig = connectSignal();
      expect(sig).toBeInstanceOf(AbortSignal);
      expect(sig!.aborted).toBe(false);
      await Promise.resolve();
      // Still the SAME signal after an await (AsyncLocalStorage propagates).
      expect(connectSignal()).toBe(sig);
    });
  });

  it("cancelConnect(id) aborts the in-flight scope's signal", async () => {
    await withConnect("b", async () => {
      const sig = connectSignal()!;
      expect(sig.aborted).toBe(false);
      cancelConnect("b");
      expect(sig.aborted).toBe(true);
    });
  });

  it("cancelConnect is a no-op for an id with nothing in flight", () => {
    expect(() => cancelConnect("nope")).not.toThrow();
  });

  it("clears the scope after completion, so a later cancel can't abort a stale signal", async () => {
    let captured!: AbortSignal;
    await withConnect("c", async () => {
      captured = connectSignal()!;
    });
    // Scope ended → the map entry is gone; cancelling now does nothing to the old signal.
    cancelConnect("c");
    expect(captured.aborted).toBe(false);
  });

  it("supersedes an older connect for the same id (re-click aborts the first)", async () => {
    let firstSignal!: AbortSignal;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    const first = withConnect("d", async () => {
      firstSignal = connectSignal()!;
      await gate; // stay in flight until the second connect has superseded us
    });

    // Second connect for the SAME id must abort the first's signal.
    const second = withConnect("d", async () => {
      expect(firstSignal.aborted).toBe(true);
    });

    release();
    await Promise.all([first, second]);
  });
});

describe("connectCancel — the OAuth loopback is torn down on cancel", () => {
  it("rejects the pending waitForCode AND closes the listener when cancelled", async () => {
    // The security lever: on cancel the loopback stops listening, so a late redirect
    // lands on a closed port → no code captured → no token minted (fail-closed).
    await withConnect("loop", async () => {
      const loop = await startLoopback(); // ephemeral port, picks up the ambient signal
      const waiting = loop.waitForCode(60_000);

      cancelConnect("loop");

      await expect(waiting).rejects.toThrow(/annulée/i);
      // Listener closed: a fresh connection to the port is refused.
      await expect(fetch(`http://127.0.0.1:${loop.port}/callback`)).rejects.toThrow();
    });
  });
});
