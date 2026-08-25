import { describe, it, expect } from "vitest";
import { shallowEqual } from "./chatStore";

// The selector bail-out (useChatSelector) rides on React's useSyncExternalStore, whose
// re-render semantics need a renderer to assert (not available here). What IS pure — and
// what makes an object-returning selector bail out per token — is shallowEqual.
describe("shallowEqual (chat-store selector bail-out)", () => {
  it("true for same ref, primitives, and value-equal fresh objects", () => {
    const o = { a: 1 };
    expect(shallowEqual(o, o)).toBe(true);
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual("x", "x")).toBe(true);
    // A selector returning a FRESH {in,out,total} each token still bails when unchanged:
    expect(shallowEqual({ inputTokens: 3, outputTokens: 5, total: 8 }, { inputTokens: 3, outputTokens: 5, total: 8 })).toBe(true);
  });

  it("false on any value / key-count / null-vs-object / type difference", () => {
    expect(shallowEqual({ total: 8 }, { total: 9 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, null)).toBe(false);
    expect(shallowEqual(null, { a: 1 })).toBe(false);
    expect(shallowEqual(1, 2)).toBe(false);
  });

  it("is SHALLOW — a nested fresh object is not equal (so keep slices flat)", () => {
    expect(shallowEqual({ x: { a: 1 } }, { x: { a: 1 } })).toBe(false);
  });
});
