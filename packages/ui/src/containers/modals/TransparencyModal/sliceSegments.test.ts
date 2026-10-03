import { describe, expect, it } from "vitest";
import { toSegments, wireSegments } from "@openmasq/redact";
import { sliceSegments, windowSegments } from "./sliceSegments";

const vault = { "[PERSON1]": "Jean Dupont", "[ORG1]": "Acme", "[ID1]": "us" };
const longest = (xs: string[]) => Math.max(...xs.map((x) => x.length));
const text = Array.from(
  { length: 400 },
  (_, i) => `Ligne ${i}: Jean Dupont chez Acme, because Acme${i % 3 ? "" : "x"} us. `,
).join("\n");

describe("windowSegments — the shown prefix is the whole segmentation's prefix", () => {
  it("cut anywhere, it matches the full segmentation sliced at the same limit", () => {
    const full = toSegments(text, vault);
    const fullWire = wireSegments(text, vault);
    for (const limit of [1, 7, 10, 11, 12, 13, 500, 1234, 5000, text.length, text.length + 50]) {
      const a = windowSegments(text, limit, longest(Object.values(vault)), (s) => toSegments(s, vault));
      const b = sliceSegments(full, limit);
      expect(a.shown).toEqual(b.shown);
      expect(a.rest).toBe(text.length - b.used);
      const w = windowSegments(text, limit, longest(Object.keys(vault)), (s) => wireSegments(s, vault));
      expect(w.shown).toEqual(sliceSegments(fullWire, limit).shown);
    }
  });

  it("never cuts a mark, and shows the text whole under the limit", () => {
    const segs = toSegments("Bonjour Jean Dupont !", vault);
    const { shown } = sliceSegments(segs, 10); // the limit falls INSIDE the name
    expect(shown.map((s) => s.value).join("")).toBe("Bonjour Jean Dupont");
    const all = windowSegments("Bonjour Jean Dupont !", 1000, 11, (s) => toSegments(s, vault));
    expect(all.rest).toBe(0);
  });
});
