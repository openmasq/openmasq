import { describe, it, expect } from "vitest";
import { writeKey } from "./writeIdempotency";

describe("writeKey", () => {
  it("is STABLE across a retry: same turn + tool + args → same key", () => {
    const a = writeKey("turn-1", "slack__send_message", { channel: "C1", text: "hi" });
    const b = writeKey("turn-1", "slack__send_message", { channel: "C1", text: "hi" });
    expect(a).toBe(b);
  });

  it("ignores arg KEY ORDER (canonicalised) — a re-serialised call is the same write", () => {
    const a = writeKey("t", "gmail__send_email", { to: "x@y.z", subject: "S", body: "B" });
    const b = writeKey("t", "gmail__send_email", { body: "B", subject: "S", to: "x@y.z" });
    expect(a).toBe(b);
  });

  it("SCOPES to the turn: the same action in a different turn is a different key", () => {
    const t1 = writeKey("turn-1", "slack__send_message", { channel: "C1", text: "hi" });
    const t2 = writeKey("turn-2", "slack__send_message", { channel: "C1", text: "hi" });
    expect(t1).not.toBe(t2);
  });

  it("distinguishes tool, and any arg change", () => {
    const base = writeKey("t", "slack__send_message", { channel: "C1", text: "hi" });
    expect(writeKey("t", "slack__update_message", { channel: "C1", text: "hi" })).not.toBe(base);
    expect(writeKey("t", "slack__send_message", { channel: "C2", text: "hi" })).not.toBe(base);
    expect(writeKey("t", "slack__send_message", { channel: "C1", text: "HI" })).not.toBe(base);
  });

  it("handles empty / nested / array args without throwing", () => {
    expect(typeof writeKey("t", "x__y", {})).toBe("string");
    expect(writeKey("t", "x__y", { a: [1, 2], b: { c: 3 } })).toBe(
      writeKey("t", "x__y", { b: { c: 3 }, a: [1, 2] }),
    );
    // array order IS semantic
    expect(writeKey("t", "x__y", { a: [1, 2] })).not.toBe(writeKey("t", "x__y", { a: [2, 1] }));
  });
});
