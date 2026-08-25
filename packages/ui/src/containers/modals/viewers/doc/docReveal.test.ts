import { describe, expect, it } from "vitest";
import { docRevealSegments } from "./docReveal";

const reps = [
  { real: "Marie Curie", fake: "Chloé Blanc", tone: "violet" },
  { real: "a@b.com", fake: "x@y.fr", tone: "blue" },
];

describe("docRevealSegments", () => {
  it("shows FAKES for non-revealed values (what leaves the machine)", () => {
    const segs = docRevealSegments("De a@b.com pour Marie Curie", reps, new Set());
    const red = segs.filter((s) => s.real);
    expect(red.map((s) => s.text)).toEqual(["x@y.fr", "Chloé Blanc"]);
    expect(red.every((s) => !s.revealed)).toBe(true);
  });

  it("shows the REAL value for an explicitly-revealed one, faking the rest", () => {
    const segs = docRevealSegments("De a@b.com pour Marie Curie", reps, new Set(["Marie Curie"]));
    const byReal = Object.fromEntries(segs.filter((s) => s.real).map((s) => [s.real, s]));
    expect(byReal["Marie Curie"].text).toBe("Marie Curie"); // in clear
    expect(byReal["Marie Curie"].revealed).toBe(true);
    expect(byReal["a@b.com"].text).toBe("x@y.fr"); // still redacted
    expect(byReal["a@b.com"].revealed).toBe(false);
  });

  it("longest-first so a value isn't split by a shorter substring", () => {
    const segs = docRevealSegments("Marie Curie", reps, new Set());
    expect(segs.filter((s) => s.real).map((s) => s.text)).toEqual(["Chloé Blanc"]);
  });

  it("returns the whole text as one plain segment when nothing matches", () => {
    expect(docRevealSegments("hello", reps, new Set())).toEqual([{ text: "hello" }]);
  });

  it("does NOT bleed a short fake into a larger word / email domain (word-boundary guard)", () => {
    // A NER-fragment "mail"→"Voxa" must NOT rewrite "email"→"eVoxa" nor swap the
    // domain inside "x@gmail.com" (which leaked the real local-part). Glued matches
    // are left verbatim.
    const frag = [{ real: "mail", fake: "Voxa", tone: "blue" }];
    const out = docRevealSegments("email: drovak@gmail.com", frag, new Set());
    const rendered = out.map((s) => s.text).join("");
    expect(rendered).toBe("email: drovak@gmail.com"); // untouched — no eVoxa / gVoxa
    expect(out.some((s) => s.real)).toBe(false); // nothing redacted (all glued)
  });

  it("still replaces a full email atomically when it IS a replacement", () => {
    const full = [{ real: "drovak@gmail.com", fake: "nathan@mail.com", tone: "blue" }];
    const out = docRevealSegments("email: drovak@gmail.com", full, new Set());
    expect(out.map((s) => s.text).join("")).toBe("email: nathan@mail.com");
    expect(out.find((s) => s.real)?.text).toBe("nathan@mail.com");
  });

  it("still redacts a standalone value whose fragment also appears in a word", () => {
    // "Paris" must redact even though "par" is glued inside "parking".
    const r = [{ real: "Paris", fake: "Lyon", tone: "mint" }];
    const out = docRevealSegments("parking à Paris", r, new Set());
    expect(out.map((s) => s.text).join("")).toBe("parking à Lyon");
  });
});
