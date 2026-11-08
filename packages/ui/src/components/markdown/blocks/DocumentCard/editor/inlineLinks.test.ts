// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { inlineFromNode, inlineToNodes } from "./inline";

/** A link in the editable document card comes from markdown a MODEL can write. Only a target the
 *  read view accepts is a live `href` there; the document's own text is written back unchanged. */
function roundTrip(md: string) {
  const p = document.createElement("p");
  for (const n of inlineToNodes(md, document)) p.appendChild(n);
  return { a: p.querySelector("a")!, back: inlineFromNode(p) };
}

describe("links in the document editor", () => {
  it("an https link is live and round-trips", () => {
    const { a, back } = roundTrip("[site](https://exemple.fr/a)");
    expect(a.getAttribute("href")).toBe("https://exemple.fr/a");
    expect(back).toBe("[site](https://exemple.fr/a)");
  });

  it("a javascript: target is never a live href, and the document keeps its text", () => {
    const { a, back } = roundTrip("[clic](javascript:alert(1))");
    expect(a.hasAttribute("href")).toBe(false);
    expect(back).toBe("[clic](javascript:alert(1))");
  });
});
