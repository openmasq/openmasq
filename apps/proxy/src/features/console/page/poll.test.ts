import { describe, expect, it } from "vitest";
import { createMaskingWatch, maskingSignature } from "./poll";

/* The panel is rebuilt with `innerHTML`, and the poll runs every five seconds with the same
   answer almost every time. Redrawing on each one threw away the reader's scroll, their
   collapsed categories and their place in a list of fifty-seven connectors — which is what
   "the page reloads itself" was. */
describe("the masking panel redraws on a change, and only on a change", () => {
  const HEALTH = { level: "standard", mode: "fake", ner: true, masking: ["email", "phone"] };

  it("draws once, then stays quiet while the run does not move", () => {
    const w = createMaskingWatch();
    expect(w.changed(HEALTH)).toBe(true); // never drawn yet
    for (let poll = 0; poll < 12; poll++) expect(w.changed({ ...HEALTH })).toBe(false);
  });

  it("redraws when the `l` key moves the level under an open panel", () => {
    const w = createMaskingWatch();
    w.changed(HEALTH);
    expect(w.changed({ ...HEALTH, level: "renforce" })).toBe(true);
    expect(w.changed({ ...HEALTH, level: "renforce" })).toBe(false); // and settles again
  });

  it.each([
    ["the mode", { mode: "token" }],
    ["the model going away", { ner: false }],
    ["a category switched off", { masking: ["email"] }],
    ["a category switched on", { masking: ["email", "phone", "iban"] }],
  ])("redraws when %s changes", (_what, patch) => {
    const w = createMaskingWatch();
    w.changed(HEALTH);
    expect(w.changed({ ...HEALTH, ...patch })).toBe(true);
  });

  /** The poll also carries counters and an uptime, which move on EVERY answer. Drawing from
   *  them would put us back where we started. */
  it("ignores everything the panel does not draw", () => {
    const w = createMaskingWatch();
    w.changed(HEALTH);
    const noise = { ...HEALTH, upMs: 12_345, calls: 7, pid: 991 } as never;
    expect(w.changed(noise)).toBe(false);
  });

  it("survives a failed poll without claiming a change", () => {
    const w = createMaskingWatch();
    w.changed(HEALTH);
    expect(w.changed(undefined)).toBe(true); // the run's state is genuinely unknown now
    expect(w.changed(undefined)).toBe(false); // …but unknown twice is not news
    expect(maskingSignature(null)).toBe("");
  });
});
