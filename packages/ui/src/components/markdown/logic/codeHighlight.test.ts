import { describe, it, expect } from "vitest";
import { canHighlight, resolveLang, highlightCode } from "./codeHighlight";

describe("codeHighlight", () => {
  it("resolves short fence tags to registered highlight.js languages", () => {
    expect(resolveLang("ts")).toBe("typescript");
    expect(resolveLang("tsx")).toBe("typescript");
    expect(resolveLang("py")).toBe("python");
    expect(resolveLang("sh")).toBe("bash");
    expect(resolveLang("html")).toBe("xml");
    expect(resolveLang("javascript")).toBe("javascript"); // canonical name passes through
  });

  it("canHighlight is false for missing / unknown languages, true for known", () => {
    expect(canHighlight()).toBe(false);
    expect(canHighlight("not-a-lang")).toBe(false);
    expect(canHighlight("python")).toBe(true);
    expect(canHighlight("JS")).toBe(true); // case-insensitive
  });

  it("highlightCode returns a hast tree with hljs token spans for known code", async () => {
    const tree = await highlightCode("const x = 1;", "js"); // lazy-loads lowlight
    expect(tree).toBeTruthy();
    expect(JSON.stringify(tree)).toContain("hljs-keyword"); // `const`
  });

  it("returns null for an unknown language or empty code (caller renders plain)", async () => {
    expect(await highlightCode("hello", "not-a-lang")).toBeNull();
    expect(await highlightCode("hello")).toBeNull(); // no lang
    expect(await highlightCode("", "js")).toBeNull();
  });
});
