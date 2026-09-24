import { describe, expect, it } from "vitest";
import { mapJsonString, mapJsonStringSync, mapStrings } from "./json";

const up = async (s: string) => s.toUpperCase();

describe("json walkers", () => {
  it("maps every string leaf, leaving numbers, booleans and nulls alone", async () => {
    expect(await mapStrings({ a: "x", b: [1, "y", { c: null, d: true, e: "z" }] }, up)).toEqual({
      a: "X",
      b: [1, "Y", { c: null, d: true, e: "Z" }],
    });
  });

  it("maps the leaves of JSON carried as a string, and treats non-JSON as text", async () => {
    expect(await mapJsonString('{"to":"x","n":2}', up)).toBe('{"to":"X","n":2}');
    expect(await mapJsonString("plain x", up)).toBe("PLAIN X");
    expect(mapJsonStringSync('["a"]', (s) => s + "!")).toBe('["a!"]');
    expect(await mapJsonString("", up)).toBe("");
  });
});
