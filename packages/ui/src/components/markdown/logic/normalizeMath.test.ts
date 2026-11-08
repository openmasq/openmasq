import { describe, expect, it } from "vitest";
import { normalizeMath } from "./katex";

/** The former implementation, kept as the ORACLE: lazy regexes, quadratic on unclosed delimiters. */
function oracle(input: string): string {
  return input
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\\\[([\s\S]+?)\\\]/g, (_m, e) => `$$${e}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_m, e) => `$${e}$`),
    )
    .join("");
}

describe("normalizeMath", () => {
  it("rewrites exactly what the lazy regexes rewrote", () => {
    const samples = [
      String.raw`a \(x\) b \[y\] c`,
      String.raw`\[\]x\]`,
      String.raw`\(\)`,
      String.raw`\[a\] \[b`,
      String.raw`\(a \[b\] c\)`,
      "`\\(code\\)` and \\(math\\)",
      "```\n\\[block\\]\n``` then \\[x\\]",
      String.raw`\[ multi
line \]`,
    ];
    for (const s of samples) expect(normalizeMath(s), s).toBe(oracle(s));
    // and on random mixes of the delimiters and their pieces
    const pieces = ["\\[", "\\]", "\\(", "\\)", "\\", "[", "]", "(", ")", "x", " ", "`", "$"];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let k = 0; k < 2000; k++) {
      const s = Array.from({ length: 1 + Math.floor(rnd() * 14) }, () => pieces[Math.floor(rnd() * pieces.length)]).join("");
      expect(normalizeMath(s), JSON.stringify(s)).toBe(oracle(s));
    }
  });

  it("stays linear on a reply full of unclosed delimiters", () => {
    const s = "\\[x ".repeat(50_000);
    const t0 = performance.now();
    normalizeMath(s);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
