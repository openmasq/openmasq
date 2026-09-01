import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The home screen NEVER hides its top — the invariant, pinned on the sheet itself.
 *
 * `.welcome` is at once the container that SCROLLS and the one that CENTERS. These two roles
 * contradict each other as soon as the content is taller than the box: `justify-content: center`
 * then pushes the start of the content ABOVE the scroll origin, and `scrollTop` doesn't
 * go below zero. The greeting wasn't cut off, then — it was UNREACHABLE
 * (measured in the built app: the title at −34 px for a 700 px window).
 *
 * `safe center` is the exact remedy: centered as long as it fits, aligned to the START as soon as it
 * overflows. A bare `center` coming back here would silently bring the bug back — hence this test
 * rather than a comment, which no CI reads.
 */
const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");

const welcome = (() => {
  const at = css.indexOf("\n.welcome {");
  expect(at, "règle `.welcome` absente").toBeGreaterThan(-1);
  return css.slice(at, css.indexOf("}", at));
})();

describe(".welcome — centré, mais jamais au prix du haut", () => {
  it("défile ET centre : les deux rôles cohabitent grâce à `safe`", () => {
    expect(welcome).toMatch(/overflow-y:\s*auto/);
    expect(welcome).toMatch(/justify-content:\s*safe\s+center/);
  });

  it("aucun `justify-content: center` nu ne subsiste dans cette règle", () => {
    expect(welcome).not.toMatch(/justify-content:\s*center\s*;/);
  });
});
