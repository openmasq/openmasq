import { describe, expect, it } from "vitest";
import { admit, CONTEXT_KEYS, EXCEPTION_KEYS } from "./admit";
import { DESKTOP_EVENTS, SOURCES, VOCABULARY } from "./index";

describe("admit — what the relay lets through", () => {
  it("refuses a source that is not a declared surface, whatever it claims", () => {
    for (const source of ["proxy", "extension", "curl", "", undefined, null, 42, "Desktop"])
      expect(admit({ source, event: "app_open" })).toEqual({ ok: false, reason: "source" });
  });

  it("refuses an event the source does not declare", () => {
    expect(admit({ source: "desktop", event: "made_up" })).toEqual({ ok: false, reason: "event" });
    expect(admit({ source: "desktop", event: "" })).toEqual({ ok: false, reason: "event" });
    expect(admit({ source: "desktop", event: "constructor" })).toEqual({ ok: false, reason: "event" });
    expect(admit({ source: "desktop", event: "__proto__" })).toEqual({ ok: false, reason: "event" });
  });

  it("keeps the declared keys and the context, drops everything else", () => {
    const a = admit({
      source: "desktop",
      event: "send_message",
      properties: { chars: "1-20", provider: "openai", env: "production", app_version: "0.8.1", prompt: "hello", $ip: "1.2.3.4" },
    });
    expect(a).toEqual({
      ok: true,
      source: "desktop",
      event: "send_message",
      properties: { chars: "1-20", provider: "openai", env: "production", app_version: "0.8.1" },
    });
  });

  it("admits $exception for every surface, with its fixed shape only", () => {
    for (const source of SOURCES) {
      const a = admit({ source, event: "$exception", properties: { $exception_list: [], scope: "auth", code: "x", stack: "…" } });
      expect(a.ok).toBe(true);
      if (a.ok) expect(Object.keys(a.properties)).toEqual(["$exception_list", "scope", "code"]);
    }
  });

  it("never throws on a malformed properties field", () => {
    for (const properties of [null, "x", 3, [1], undefined]) {
      const a = admit({ source: "desktop", event: "app_open", properties });
      expect(a).toMatchObject({ ok: true, properties: {} });
    }
  });

  it("the vocabulary names no key twice with the context, and every list is unique", () => {
    for (const [source, events] of Object.entries(VOCABULARY)) {
      for (const [event, keys] of Object.entries(events as Record<string, readonly string[]>)) {
        expect(new Set(keys).size, `${source}.${event}`).toBe(keys.length);
        for (const k of keys) expect(CONTEXT_KEYS as readonly string[], `${source}.${event}.${k}`).not.toContain(k);
      }
    }
    expect(Object.keys(DESKTOP_EVENTS).length).toBeGreaterThan(30);
    expect(SOURCES).toEqual(["desktop"]);
    expect(new Set(EXCEPTION_KEYS).size).toBe(EXCEPTION_KEYS.length);
  });
});
