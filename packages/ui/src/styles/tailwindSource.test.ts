import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The apps consume @openmasq/ui through node_modules, which Tailwind v4's content detection
 * skips: the `@source` in the cascade is the only thing that makes it generate the utilities
 * the components use. Lost once in a split of this sheet — every `flex` / `min-h-0` in a
 * component then compiled to nothing and the conversation thread no longer scrolled.
 */
describe("the stylesheet cascade", () => {
  const sheet = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

  it("tells Tailwind to scan the ui sources", () => {
    expect(sheet).toMatch(/^@source\s+"\.\/\*\*\/\*\.\{ts,tsx\}";$/m);
  });

  it("imports Tailwind's utilities layer", () => {
    expect(sheet).toContain('@import "tailwindcss/utilities.css" layer(utilities);');
  });
});
