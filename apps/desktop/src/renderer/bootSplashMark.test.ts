import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The brand mark exists in FOUR places on purpose, and none of them can import the
 * others: `BrandMark.tsx` is the source, but the boot splash must paint before any
 * bundle loads, the OAuth return page is a string served by the main process to a
 * browser, and the app icon is rasterised by electron-builder from an SVG. A comment
 * saying "keep in sync" cannot fail CI (root rule 9), so this reads all four and
 * compares the geometry itself.
 *
 * What is pinned is the RING path and the BAR rect — the shape. Colour is not: each
 * copy paints for its own ground (`currentColor` in the app, a gradient on the OAuth
 * tile, white-on-ink in the icon).
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(HERE, p), "utf8");

const SOURCE = read("../../../../packages/ui/src/components/media/BrandLogo/BrandMark.tsx");

/** The one true geometry, taken from the component every run — never re-typed here. */
const ring = SOURCE.match(/BRAND_RING\s*=\s*\n?\s*"([^"]+)"/)?.[1];
const bar = SOURCE.match(/BRAND_BAR\s*=\s*\{([^}]+)\}/)?.[1];

describe("brand mark — the copies that cannot import the source", () => {
  it("the component still exposes a ring path and a bar rect", () => {
    expect(ring, "BRAND_RING not found — the parity test can no longer read the source").toBeTruthy();
    expect(bar, "BRAND_BAR not found — the parity test can no longer read the source").toBeTruthy();
  });

  /** `{ x: 2, y: 41, … }` → the `x="2" y="41" …` an SVG file writes. */
  const barAttrs = () =>
    Object.fromEntries(
      (bar ?? "")
        .split(",")
        .map((pair) => pair.split(":").map((s) => s.trim().replace(/"/g, "")))
        .filter((kv) => kv.length === 2 && kv[0]),
    ) as Record<string, string>;

  const carriers: [string, string][] = [
    ["boot splash (paints before the bundle)", "./index.html"],
    ["OAuth return page (served to a browser)", "../main/mcp/oauthLoopback.ts"],
    ["app icon (rasterised by electron-builder)", "../../build/icon.svg"],
  ];

  for (const [what, path] of carriers) {
    it(`${what} draws the same ring`, () => {
      expect(read(path)).toContain(ring);
    });

    it(`${what} draws the same bar`, () => {
      const html = read(path);
      const attrs = barAttrs();
      for (const [k, v] of Object.entries(attrs)) {
        expect(html, `${k}="${v}" missing`).toMatch(new RegExp(`${k}\\s*=\\s*"${v}"`));
      }
    });
  }
});
