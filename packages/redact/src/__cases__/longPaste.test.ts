import { describe, expect, it } from "vitest";
import { pseudonymize, unredact } from "../index";
import { longPasteDoc } from "./longPasteDoc";

/**
 * A long paste must not freeze the send. Every gate of the candidate pipeline used to scan
 * the whole text once per candidate: on a 200k-character pleading (thousands of candidates)
 * the masking pass took ~40 s with NER detections (measured 2026-10-03, Node, M-series),
 * ~1 s after the gates were indexed. The bound below is deliberately loose — 15× the
 * measured time — so a slow CI runner never trips it, while a return of the per-candidate
 * scans (seconds per 100k characters, growing with the square) still does.
 */
describe("long paste (200k characters)", () => {
  it("masks within the bound, and every value still round-trips", async () => {
    const { text, detections } = longPasteDoc(200_000);
    const vault: Record<string, string> = {};
    const t0 = performance.now();
    const out = await pseudonymize(text, { vault, detectLocal: async () => detections, reFakeExisting: true });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(15_000);
    expect(out.matches.length).toBeGreaterThan(1000);
    // Fail-closed sanity on the long path: no real e-mail of the document reaches the wire,
    // and the reverse pass restores the original text.
    expect(out.text).not.toMatch(/@lawfirm\d+\.com/);
    expect(unredact(out.text, vault)).toBe(text);
  }, 120_000);
});
