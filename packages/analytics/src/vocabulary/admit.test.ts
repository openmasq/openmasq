import { describe, expect, it } from "vitest";
import { admit, CONTEXT_KEYS, EXCEPTION_KEYS, MAX_LIST_ITEMS, MAX_VALUE_CHARS } from "./admit";
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
      properties: { chars: "1-20", provider: "openai", env: "production", app_version: "0.8.1", $session_id: "s", prompt: "hello", $ip: "1.2.3.4" },
    });
    expect(a).toEqual({
      ok: true,
      source: "desktop",
      event: "send_message",
      properties: { chars: "1-20", provider: "openai", env: "production", app_version: "0.8.1", $session_id: "s" },
    });
  });

  it("admits $exception for every surface, with its fixed shape only", () => {
    for (const source of SOURCES) {
      const a = admit({ source, event: "$exception", properties: { $exception_list: [], scope: "auth", code: "x", stack: "…" } });
      expect(a.ok).toBe(true);
      if (a.ok) expect(Object.keys(a.properties)).toEqual(["$exception_list", "scope", "code"]);
    }
  });

  // A forger may post under a declared key: the key is declared, its SHAPE is the sink's.
  it("keeps a declared key only as a bounded primitive or a short string[]", () => {
    const a = admit({
      source: "desktop",
      event: "send_message",
      properties: {
        chars: { text: "the whole conversation" },
        provider: "x".repeat(5000),
        env: ["a".repeat(900), ...Array.from({ length: 200 }, () => "b")],
        app_version: Number.NaN,
        $session_id: [["nested"]],
      },
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.properties.chars).toBeUndefined();
    expect((a.properties.provider as string).length).toBe(MAX_VALUE_CHARS);
    expect((a.properties.env as string[]).length).toBe(MAX_LIST_ITEMS);
    expect((a.properties.env as string[])[0].length).toBe(MAX_VALUE_CHARS);
    expect(a.properties.app_version).toBeUndefined();
    expect(a.properties.$session_id).toBeUndefined();
  });

  it("rebuilds $exception_list as the sink's one entry, its message reduced", () => {
    const forged = admit({
      source: "desktop",
      event: "$exception",
      properties: {
        scope: "mcp",
        code: "tool-loop",
        $exception_list: [
          { type: "<script>", value: "Bonjour, je suis Marie Morvan, voici mon dossier", mechanism: { handled: "yes" }, stacktrace: { frames: ["x"] }, extra: { a: 1 } },
          { type: "Second", value: "ignored" },
        ],
      },
    });
    expect(forged.ok).toBe(true);
    if (!forged.ok) return;
    const list = forged.properties.$exception_list as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0])).toEqual(["type", "value", "mechanism"]);
    expect(list[0].type).toBe("Error");
    expect(list[0].value).toMatch(/^‹msg:[0-9a-f]{8}›$/);
    expect(list[0].mechanism).toEqual({ handled: false, type: "generic" });
  });

  it("leaves what an honest sink sent as it was", () => {
    const entry = (value: string) => ({ type: "TypeError", value, mechanism: { handled: true, type: "generic" } });
    for (const value of ["mcp: tool-loop", "‹msg:0a1b2c3d›", "spawn npx ENOENT", "Cannot read properties of undefined (reading 'x')"]) {
      const a = admit({ source: "desktop", event: "$exception", properties: { scope: "mcp", code: "tool-loop", $exception_list: [entry(value)] } });
      expect(a.ok && (a.properties.$exception_list as unknown[])[0]).toEqual(entry(value));
    }
    for (const bad of ["oops", null, 3, [null], [[1]], ["text"]]) {
      const a = admit({ source: "desktop", event: "$exception", properties: { $exception_list: bad } });
      expect(a.ok && a.properties.$exception_list).toEqual([]);
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
