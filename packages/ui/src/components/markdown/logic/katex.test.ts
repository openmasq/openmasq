import { describe, it, expect } from "vitest";
import { normalizeMath } from "./katex";

describe("normalizeMath", () => {
  it("converts \\(…\\) and \\[…\\] to $ / $$ delimiters", () => {
    expect(normalizeMath("inline \\(a+b\\) here")).toBe("inline $a+b$ here");
    expect(normalizeMath("block \\[x^2\\] end")).toBe("block $$x^2$$ end");
  });

  it("leaves math delimiters inside code spans/blocks untouched", () => {
    expect(normalizeMath("`\\(a\\)`")).toBe("`\\(a\\)`");
    expect(normalizeMath("```\n\\[x\\]\n```")).toBe("```\n\\[x\\]\n```");
  });

  it("is a no-op on text with no math", () => {
    expect(normalizeMath("just prose")).toBe("just prose");
  });
});
