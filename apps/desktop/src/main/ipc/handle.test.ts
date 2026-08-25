import { describe, it, expect, vi, beforeEach } from "vitest";

// Electron isn't available in vitest — capture what `handle` registers.
const registered = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: unknown, ...a: unknown[]) => unknown) => {
      registered.set(channel, fn);
    },
  },
}));

const { handle, str, num, bool, obj, arr, any, nullable, optional, IpcArgumentError } =
  await import("./handle");

/**
 * The floor this file pins: the renderer is untrusted (root rule 7), so a handler's
 * parameter TYPES cannot be what protects it — they are erased. A malformed call must
 * be refused BEFORE the privileged body runs, and the refusal must not carry the value.
 */

const invoke = (channel: string, ...args: unknown[]) => registered.get(channel)!({}, ...args);

beforeEach(() => registered.clear());

describe("handle — a malformed call never reaches the body", () => {
  it("runs the body on a well-formed call", () => {
    const body = vi.fn(() => "ok");
    handle("t:good", [str, num], body);
    expect(invoke("t:good", "a", 2)).toBe("ok");
    expect(body).toHaveBeenCalledWith({}, "a", 2);
  });

  it("REFUSES a wrong type — the body is never called", () => {
    const body = vi.fn();
    handle("t:bad", [str], body);
    expect(() => invoke("t:bad", { evil: true })).toThrow(IpcArgumentError);
    expect(body).not.toHaveBeenCalled();
  });

  it("REFUSES a missing argument (the XSS that calls with none)", () => {
    const body = vi.fn();
    handle("t:missing", [str, str], body);
    expect(() => invoke("t:missing")).toThrow(IpcArgumentError);
    expect(() => invoke("t:missing", "only-one")).toThrow(IpcArgumentError);
    expect(body).not.toHaveBeenCalled();
  });

  it("never puts the argument VALUE in the error (it can be a provider key)", () => {
    handle("t:secret", [str], () => undefined);
    let message = "";
    try {
      invoke("t:secret", { apiKey: "sk-live-SUPERSECRET" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("t:secret");
    expect(message).toContain("argument 0");
    expect(message).not.toContain("SUPERSECRET");
    expect(message).not.toContain("apiKey");
  });

  it("drops extra arguments rather than forwarding them", () => {
    const body = vi.fn();
    handle("t:extra", [str], body);
    invoke("t:extra", "a", "smuggled", { more: 1 });
    expect(body).toHaveBeenCalledWith({}, "a");
  });
});

describe("the checks themselves", () => {
  it("obj rejects null and arrays — the two shapes that crash a property read", () => {
    expect(obj.check({})).toBe(true);
    expect(obj.check(null)).toBe(false);
    expect(obj.check([])).toBe(false);
  });

  it("num rejects NaN and Infinity (a length/offset that would poison a read)", () => {
    expect(num.check(0)).toBe(true);
    expect(num.check(NaN)).toBe(false);
    expect(num.check(Infinity)).toBe(false);
  });

  it("nullable admits null but still rejects the wrong type", () => {
    const c = nullable(str);
    expect(c.check(null)).toBe(true);
    expect(c.check("x")).toBe(true);
    expect(c.check(3)).toBe(false);
  });

  it("optional admits a missing argument but still rejects the wrong type", () => {
    const c = optional(num);
    expect(c.check(undefined)).toBe(true);
    expect(c.check(3)).toBe(true);
    expect(c.check("3")).toBe(false);
  });

  it("nullable(str) does NOT admit undefined, and optional does NOT admit null", () => {
    // The two are distinct on purpose: a channel that accepts "no account" (null)
    // is not the same as one whose argument may be omitted.
    expect(nullable(str).check(undefined)).toBe(false);
    expect(optional(str).check(null)).toBe(false);
  });

  it("bool / arr / any behave as named", () => {
    expect(bool.check(false)).toBe(true);
    expect(bool.check(0)).toBe(false);
    expect(arr.check([])).toBe(true);
    expect(arr.check({})).toBe(false);
    expect(any.check(undefined)).toBe(true);
  });
});
