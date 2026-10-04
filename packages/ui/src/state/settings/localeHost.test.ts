import { afterEach, describe, expect, it, vi } from "vitest";
import { reportLocale, saveDeviceLocale, setHostLocaleSink } from "./locale";

// The host hears the interface language (the desktop's native dialogs speak it).
describe("the language reaches the host", () => {
  afterEach(() => setHostLocaleSink(null));

  it("installing the sink reports the current language at once", () => {
    const sink = vi.fn();
    setHostLocaleSink(sink);
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("a change is reported, a repeat is not", () => {
    const sink = vi.fn();
    setHostLocaleSink(sink);
    const first = sink.mock.calls[0]![0];
    const other = first === "fr" ? "en" : "fr";
    sink.mockClear();
    saveDeviceLocale(other);
    reportLocale(other);
    saveDeviceLocale(first);
    expect(sink.mock.calls).toEqual([[other], [first]]);
  });

  it("a sink that throws never breaks a language change", () => {
    setHostLocaleSink(() => {
      throw new Error("bridge gone");
    });
    expect(() => saveDeviceLocale("en")).not.toThrow();
  });

  it("without a sink nothing is sent", () => {
    expect(() => reportLocale("en")).not.toThrow();
  });
});
