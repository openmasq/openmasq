import { describe, expect, it } from "vitest";
import { cancelExtractJob, registerExtractJob } from "./extractCancel";

describe("extract cancel registry — a renderer stops its OWN reads only", () => {
  it("cancels the job registered under the same owner and id", () => {
    const { signal } = registerExtractJob(1, "chip-a");
    expect(cancelExtractJob(1, "chip-a")).toBe(true);
    expect(signal?.aborted).toBe(true);
  });

  it("another webContents naming the same id reaches nothing", () => {
    const { signal, done } = registerExtractJob(1, "chip-b");
    expect(cancelExtractJob(2, "chip-b")).toBe(false);
    expect(signal?.aborted).toBe(false);
    done();
  });

  it("a malformed id is never registered nor cancellable (untrusted renderer input)", () => {
    for (const bad of [undefined, 42, "", "a:b", "../x", "x".repeat(65), { toString: () => "chip" }]) {
      expect(registerExtractJob(1, bad).signal).toBeUndefined();
      expect(cancelExtractJob(1, bad)).toBe(false);
    }
  });

  it("a finished job is gone: removing its chip afterwards is a no-op", () => {
    const { signal, done } = registerExtractJob(1, "chip-c");
    done();
    expect(cancelExtractJob(1, "chip-c")).toBe(false);
    expect(signal?.aborted).toBe(false);
  });
});
