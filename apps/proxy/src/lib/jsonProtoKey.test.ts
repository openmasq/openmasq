import { describe, expect, it } from "vitest";
import { mapStrings, mapStringsSync } from "./json";

/** `__proto__` is a valid JSON key a caller can send. Mapped like any other, it must stay a
 *  KEY: as an assignment target it would become the rebuilt object's prototype and vanish
 *  from what is forwarded. */
const parsed = () => JSON.parse('{"__proto__":{"email":"jean@exemple.fr"},"a":"b"}') as unknown;
const up = (s: string) => s.toUpperCase();

describe("a `__proto__` key in a mapped JSON value", () => {
  it("stays a key, mapped, in the sync walk", () => {
    const out = mapStringsSync(parsed(), up);
    expect(JSON.stringify(out)).toBe('{"__proto__":{"email":"JEAN@EXEMPLE.FR"},"a":"B"}');
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
  it("stays a key, mapped, in the async walk", async () => {
    const out = await mapStrings(parsed(), async (s) => up(s));
    expect(JSON.stringify(out)).toBe('{"__proto__":{"email":"JEAN@EXEMPLE.FR"},"a":"B"}');
  });
});
