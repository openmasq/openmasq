import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reconnectDelayMs, startReconnectLoop } from "./useAuthReconnect";

describe("reconnectDelayMs", () => {
  it("backs off 3s → 6s → 12s → 24s then caps at 30s", () => {
    expect(reconnectDelayMs(0)).toBe(3_000);
    expect(reconnectDelayMs(1)).toBe(6_000);
    expect(reconnectDelayMs(2)).toBe(12_000);
    expect(reconnectDelayMs(3)).toBe(24_000);
    expect(reconnectDelayMs(4)).toBe(30_000); // capped
    expect(reconnectDelayMs(50)).toBe(30_000); // stays capped, never overflows
  });

  it("clamps a negative attempt to the first delay", () => {
    expect(reconnectDelayMs(-1)).toBe(3_000);
  });
});

describe("startReconnectLoop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("retries on the backoff schedule, not eagerly", async () => {
    const reconnect = vi.fn(async () => null); // server still down
    const stop = startReconnectLoop(reconnect);

    expect(reconnect).not.toHaveBeenCalled(); // waits the first delay
    await vi.advanceTimersByTimeAsync(3_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(reconnect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(reconnect).toHaveBeenCalledTimes(3);
    stop();
  });

  it("keeps retrying after a rejected attempt (transient throw is swallowed)", async () => {
    const reconnect = vi.fn(async () => {
      throw new Error("network");
    });
    const stop = startReconnectLoop(reconnect);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(reconnect).toHaveBeenCalledTimes(2);
    stop();
  });

  it("stops scheduling once the caller stops the loop", async () => {
    const reconnect = vi.fn(async () => null);
    const stop = startReconnectLoop(reconnect);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
    stop(); // the banner cleared → loop torn down
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it("does not fire a scheduled tick after stop, even mid-flight", async () => {
    let resolveInFlight: (v: unknown) => void = () => {};
    const reconnect = vi.fn(
      () => new Promise((res) => (resolveInFlight = res)),
    );
    const stop = startReconnectLoop(reconnect);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(reconnect).toHaveBeenCalledTimes(1);
    stop(); // stop while the first attempt is still pending
    resolveInFlight(null); // it settles AFTER stop
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reconnect).toHaveBeenCalledTimes(1); // no further schedule
  });
});
