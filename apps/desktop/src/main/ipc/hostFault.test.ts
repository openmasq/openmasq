import { describe, it, expect, vi, beforeEach } from "vitest";

const registered = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
vi.mock("electron", () => ({
  ipcMain: { handle: (channel: string, fn: (e: unknown, ...a: unknown[]) => unknown) => registered.set(channel, fn) },
}));
vi.mock("./senderGate", () => ({ assertTrustedSender: () => {} }));

const { handle, str } = await import("./handle");
const { isHostFault, guardFaults, setFaultReporter, resetHostFaults } = await import("./hostFault");

const invoke = (channel: string, ...args: unknown[]) => registered.get(channel)!({}, ...args);

// The property: a fault of a handler's OWN code is heard in main, once, with the channel and
// the error and NOTHING of the call; a refusal the handler worded is not a fault; and the
// caller receives exactly what it received before.
beforeEach(() => {
  registered.clear();
  resetHostFaults();
});

describe("isHostFault", () => {
  it("names the code's faults and the local database's, not a worded refusal", () => {
    expect(isHostFault(new TypeError("x is not a function"))).toBe(true);
    expect(isHostFault(new ReferenceError("y is not defined"))).toBe(true);
    expect(isHostFault(new RangeError("Invalid array length"))).toBe(true);
    expect(isHostFault(Object.assign(new Error("constraint"), { code: "SQLITE_CONSTRAINT" }))).toBe(true);
    expect(isHostFault(new Error("SQLITE_BUSY: database is locked"))).toBe(true);
    expect(isHostFault(Object.assign(new Error("a != b"), { name: "AssertionError" }))).toBe(true);
    expect(isHostFault(new Error("this folder is not granted"))).toBe(false);
    expect(isHostFault("a string")).toBe(false);
    expect(isHostFault(null)).toBe(false);
  });
});

describe("a handler's own fault is heard in main", () => {
  it("reports channel + error once, rethrows unchanged, and carries no argument", async () => {
    const report = vi.fn();
    setFaultReporter(report);
    const fault = new TypeError("Cannot read properties of undefined (reading 'id')");
    handle("keys:set", [str, str], () => {
      throw fault;
    });
    expect(() => invoke("keys:set", "openai", "sk-REAL-PROVIDER-KEY")).toThrow(fault);
    expect(() => invoke("keys:set", "openai", "sk-REAL-PROVIDER-KEY")).toThrow(fault);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith("keys:set", fault);
    expect(JSON.stringify(report.mock.calls)).not.toContain("sk-REAL-PROVIDER-KEY");
  });

  it("hears an ASYNC body's rejection too", async () => {
    const report = vi.fn();
    setFaultReporter(report);
    handle("db:load", [], async () => {
      throw Object.assign(new Error("database disk image is malformed"), { code: "SQLITE_CORRUPT" });
    });
    await expect(invoke("db:load")).rejects.toThrow("malformed");
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toBe("db:load");
  });

  it("a worded refusal reaches the caller and is NOT reported", async () => {
    const report = vi.fn();
    setFaultReporter(report);
    handle("files:read", [str], () => {
      throw new Error("read refused: outside the granted folders");
    });
    expect(() => invoke("files:read", "/etc/passwd")).toThrow("read refused");
    handle("files:read-async", [str], async () => {
      throw new Error("read refused");
    });
    await expect(invoke("files:read-async", "/x")).rejects.toThrow("read refused");
    expect(report).not.toHaveBeenCalled();
  });

  it("a fault heard before the reporter exists is delivered when it arrives; a value passes through", () => {
    expect(() =>
      guardFaults("early:call", () => {
        throw new RangeError("Invalid array length");
      }),
    ).toThrow(RangeError);
    const report = vi.fn();
    setFaultReporter(report);
    expect(report).toHaveBeenCalledTimes(1);
    expect(guardFaults("ok:call", () => 42)).toBe(42);
  });
});
