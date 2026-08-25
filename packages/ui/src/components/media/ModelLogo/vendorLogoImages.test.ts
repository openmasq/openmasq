import { describe, expect, it } from "vitest";
import { VENDOR_LOGO_KEYS, vendorLogo } from "./vendorLogoImages";
import { familyBrand } from "./familyBrands";
import { glyphForFamily } from "./glyphKeys";
import { canonicalVendorKey } from "../../../prompt/vendorKey";

describe("vendorLogoImages", () => {
  it("keys on CANONICAL vendor keys", () => {
    // `modelMark` looks these up AFTER folding the id's prefix, so a raw slug
    // (`bytedance-seed`, `x-ai`) would be a key nothing can ever reach.
    for (const key of VENDOR_LOGO_KEYS) expect(canonicalVendorKey(key), key).toBe(key);
  });

  it("holds no key already covered by a glyph or a simple-icons brand", () => {
    // `vendorMark` tries glyph → brand → image, so an overlapping entry is dead weight.
    for (const key of VENDOR_LOGO_KEYS) {
      expect(glyphForFamily(key), key).toBeNull();
      expect(familyBrand(key), key).toBeUndefined();
    }
  });

  it("embeds every mark as a data: URL — the CSP allows no remote host", () => {
    for (const key of VENDOR_LOGO_KEYS) {
      const src = vendorLogo(key)!.src;
      expect(src.startsWith("data:image/png;base64,") || src.startsWith("data:image/svg+xml,"), key).toBe(
        true,
      );
      expect(src.length, key).toBeGreaterThan(64);
    }
  });

  it("ships no SVG that reaches off-machine or scripts", () => {
    for (const key of VENDOR_LOGO_KEYS) {
      const src = vendorLogo(key)!.src;
      if (!src.startsWith("data:image/svg+xml,")) continue;
      const svg = decodeURIComponent(src.slice("data:image/svg+xml,".length));
      expect(svg, key).not.toMatch(/<script|<image|<foreignObject/i);
      // No remote reference — `xmlns` is a namespace NAME, never fetched, so it is the
      // one http(s) string allowed through.
      const refs = [...svg.matchAll(/\b(?:xlink:href|href|src)\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
      for (const ref of refs) expect(ref, `${key} → ${ref}`).not.toMatch(/^(?:https?:)?\/\//i);
      expect(svg, key).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i);
    }
  });
});
