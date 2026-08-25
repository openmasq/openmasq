import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reasoningRelay } from "./reasoningRelay";

const upper = (s: string) => s.replace(/CLIENT_1/g, "Rebour");

describe("reasoningRelay", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("un-redacts the accumulated reflection before showing it", () => {
    const seen: string[] = [];
    const relay = reasoningRelay(upper, (t) => seen.push(t), 50);
    relay.push("L'utilisateur parle de ");
    relay.push("CLIENT_1.");
    vi.advanceTimersByTime(50);
    expect(seen).toEqual(["L'utilisateur parle de Rebour."]);
  });

  it("coalesces a burst into ONE flush (never one render per token)", () => {
    const apply = vi.fn();
    const relay = reasoningRelay((s) => s, apply, 50);
    for (let i = 0; i < 40; i++) relay.push("x");
    expect(apply).not.toHaveBeenCalled(); // nothing rendered yet
    vi.advanceTimersByTime(50);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith("x".repeat(40));
  });

  it("done() KEEPS the reflection — the turn's account outlives the turn", () => {
    const apply = vi.fn();
    const relay = reasoningRelay((s) => s, apply, 50);
    relay.push("réflexion");
    vi.advanceTimersByTime(50);
    relay.done();
    expect(apply).toHaveBeenLastCalledWith("réflexion");
  });

  it("done() WRITES the tail the pending flush never got to", () => {
    // The last deltas routinely arrive inside the throttle window: sealing without a
    // final write would truncate the kept reflection at the previous tick.
    const apply = vi.fn();
    const relay = reasoningRelay((s) => s, apply, 50);
    relay.push("début ");
    vi.advanceTimersByTime(50);
    relay.push("et fin"); // timer armed…
    relay.done(); // …turn settles first
    vi.advanceTimersByTime(500); // the cancelled timer must not fire a second write
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith("début et fin");
  });

  it("a turn with NO reflection writes nothing at all", () => {
    const apply = vi.fn();
    const relay = reasoningRelay((s) => s, apply, 50);
    relay.done();
    expect(apply).not.toHaveBeenCalled();
  });

  it("ignores empty deltas (no timer, no render)", () => {
    const apply = vi.fn();
    const relay = reasoningRelay((s) => s, apply, 50);
    relay.push("");
    vi.advanceTimersByTime(500);
    expect(apply).not.toHaveBeenCalled();
  });
});
