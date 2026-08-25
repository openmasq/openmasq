import { describe, it, expect } from "vitest";
import { detectUrlSpans, occursOutsideUrl } from "./urls";
import { redact } from "./redact";

describe("detectUrlSpans", () => {
  it("spans full URLs, rooted asset paths and bare cache-buster filenames", () => {
    const cases = [
      "https://a.getty.com/x?y=1",
      "/GettyImages-2243468030-d1bdc99d524f4b16b3bc08c6dcf31f18.jpg",
      "1783487957374-gettyimages-2284522645-porzycki-natosumm260707_np24C.jpeg",
      "www.example.com/logo.png",
    ];
    for (const c of cases) {
      const spans = detectUrlSpans(c);
      expect(spans.some(([s, e]) => s === 0 && e === c.length)).toBe(true);
    }
  });

  it("does NOT treat a short human filename as a URL asset", () => {
    expect(detectUrlSpans("photo.jpg")).toHaveLength(0);
    expect(detectUrlSpans("logo.png")).toHaveLength(0);
    expect(detectUrlSpans("CV.pdf")).toHaveLength(0);
  });
});

describe("occursOutsideUrl", () => {
  it("false when the value only appears inside a URL, true when it also appears in prose", () => {
    const text = "voir /GettyImages-2243468030-d1bdc99d524f4b16b3bc08c6dcf31f18.jpg ici";
    const spans = detectUrlSpans(text);
    expect(occursOutsideUrl("GettyImages-2243468030-d1bdc99d524f4b16b3bc08c6dcf31f18.jpg", text, spans)).toBe(false);

    const t2 = "Paris https://x.com/Paris.png";
    expect(occursOutsideUrl("Paris", t2, detectUrlSpans(t2))).toBe(true); // standalone Paris survives
  });
});

describe("redact() with the `url` category OFF", () => {
  const OFF = ["url"];
  it("leaves image URL paths / filenames in clear", () => {
    const text =
      "Image /GettyImages-2243468030-d1bdc99d524f4b16b3bc08c6dcf31f18.jpg et " +
      "1783487957374-gettyimages-2284522645-porzycki-natosumm260707_np24C.jpeg";
    const { text: out } = redact(text, { disabledKinds: OFF });
    expect(out).toBe(text); // nothing redacted
  });

  it("still redacts a real path OUTSIDE any URL", () => {
    const { text: out } = redact("mon fichier /Users/julien/Downloads/budget.xlsx", {
      disabledKinds: OFF,
    });
    expect(out).not.toContain("/Users/julien/Downloads/budget.xlsx");
    expect(out).toContain("[REDACTED_");
  });

  it("ON (url not disabled) still redacted the asset path", () => {
    const text = "Image /GettyImages-2243468030-d1bdc99d524f4b16b3bc08c6dcf31f18.jpg";
    const { text: out } = redact(text, {}); // url category ON (not in disabledKinds)
    expect(out).not.toBe(text);
  });
});
