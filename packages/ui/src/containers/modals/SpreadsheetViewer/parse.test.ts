import { describe, it, expect } from "vitest";
import { makeMatcher, segmentsOf } from "./parse";

const reps = [{ real: "Julien Sabourdin", fake: "Jade Savel", tone: "coral" }];

describe("SpreadsheetViewer segmentsOf — carries the FAKE for the redacted grid", () => {
  it("splits a cell and attaches tone + real + fake to the matched span", () => {
    const m = makeMatcher(reps);
    const segs = segmentsOf("Client: Julien Sabourdin (VIP)", m);
    const hit = segs.find((s) => s.real);
    expect(hit).toMatchObject({
      text: "Julien Sabourdin",
      real: "Julien Sabourdin",
      fake: "Jade Savel", // ← what the redacted cell DISPLAYS (was missing → showed the real)
      tone: "coral",
    });
    // the surrounding text stays plain (no real/fake)
    expect(segs.filter((s) => !s.real).map((s) => s.text).join("")).toBe("Client:  (VIP)");
  });

  it("also matches the FAKE (post-send scrubbed bytes) → same real/fake meta", () => {
    const m = makeMatcher(reps);
    const hit = segmentsOf("cc Jade Savel", m).find((s) => s.real);
    expect(hit).toMatchObject({ text: "Jade Savel", real: "Julien Sabourdin", fake: "Jade Savel" });
  });

  it("no replacements → a single plain segment (no matcher)", () => {
    expect(segmentsOf("nothing here", makeMatcher([]))).toEqual([{ text: "nothing here" }]);
  });
});
