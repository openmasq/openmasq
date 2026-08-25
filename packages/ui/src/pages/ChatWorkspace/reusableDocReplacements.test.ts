import { describe, it, expect } from "vitest";
import { reusableDocReplacements } from "./reusableDocReplacements";
import { redactEngineSig } from "./redactEngineSig";
import type { Settings } from "../../types";
import type { Attachment } from "./Composer";

const settings = { redactEngine: "patterns", redactCategories: {} } as unknown as Settings;
const cur = redactEngineSig(settings);
const att = (over: Partial<Attachment>): Attachment => ({ name: "f", cid: "1", redactPreview: 0, ...over }) as Attachment;
const reps = [{ real: "A", fake: "B", tone: "coral" }];

describe("reusableDocReplacements", () => {
  it("reuses a file's map only when its stamped signature is CURRENT", () => {
    const list = [
      att({ name: "ok.pdf", replacements: reps, redactEngineSig: cur }),
      att({ name: "stale.pdf", replacements: [{ real: "C", fake: "D", tone: "coral" }], redactEngineSig: "OLD#sig" }),
      att({ name: "empty.pdf", replacements: [], redactEngineSig: cur }),
    ] as Attachment[];
    const out = reusableDocReplacements(list, undefined, settings, undefined);
    expect(Object.keys(out)).toEqual(["ok.pdf"]); // stale + empty excluded
    expect(out["ok.pdf"]).toHaveLength(1);
  });

  it("SECURITY: withholds EVERYTHING when the conversation has a category override", () => {
    const list = [att({ name: "ok.pdf", replacements: reps, redactEngineSig: cur })] as Attachment[];
    // a non-empty per-conversation override could redact a stricter set → re-detect, don't reuse
    expect(reusableDocReplacements(list, { name: false }, settings, undefined)).toEqual({});
    // an EMPTY override map does not withhold
    expect(reusableDocReplacements(list, {}, settings, undefined)).toEqual({ "ok.pdf": reps });
  });

  // ── the Coffre's contract: "always redacted, every send, every conversation" ──────
  // The drop-time document pass applies NO `forced` list, so it cannot have redacted a
  // Coffre term; and `sendForcedList` filters against `modelText`, which EXCLUDES reused
  // documents — so reusing the map shipped the term IN CLEAR. Re-detect instead.
  it("SECURITY: withholds a file whose text contains a FORCED (Coffre) term", () => {
    const list = [
      att({ name: "contract.pdf", text: "Le projet Aurora démarre en mai.", replacements: reps, redactEngineSig: cur }),
      att({ name: "other.pdf", text: "Rien de sensible ici.", replacements: reps, redactEngineSig: cur }),
    ] as Attachment[];
    const out = reusableDocReplacements(list, undefined, settings, [{ value: "Aurora" }]);
    expect(out["contract.pdf"]).toBeUndefined(); // → the send re-detects it WITH `forced`
    expect(out["other.pdf"]).toEqual(reps); // unaffected files still reuse (no perf regression)
  });

  it("SECURITY: the forced-term match is case-insensitive (like the engine's isKept)", () => {
    const list = [
      att({ name: "c.pdf", text: "le projet aurora", replacements: reps, redactEngineSig: cur }),
    ] as Attachment[];
    expect(reusableDocReplacements(list, undefined, settings, [{ value: "Aurora" }])).toEqual({});
  });

  // ── org-MANDATED categories ───────────────────────────────────────────────────────
  // A member may switch `name` off globally; the org forces it back on. The send merges
  // that (`effectiveRedactCategories`) but a file redacted under the member's looser
  // settings must not be reused, or every name in the document goes out in clear.
  it("SECURITY: a file redacted WITHOUT the org's mandated categories is stale", () => {
    const list = [att({ name: "cv.pdf", text: "x", replacements: reps, redactEngineSig: cur })] as Attachment[];
    // same settings, but the org now mandates `name` → the stamped sig no longer matches
    expect(reusableDocReplacements(list, undefined, settings, undefined, ["name"])).toEqual({});
    // …and it reuses again once the file carries the org-aware signature
    const fresh = [
      att({
        name: "cv.pdf",
        text: "x",
        replacements: reps,
        redactEngineSig: redactEngineSig(settings, ["name"]),
      }),
    ] as Attachment[];
    expect(reusableDocReplacements(fresh, undefined, settings, undefined, ["name"])).toEqual({
      "cv.pdf": reps,
    });
  });

  it("the org signature is order-independent (a profile refresh must not invalidate)", () => {
    expect(redactEngineSig(settings, ["name", "company"])).toBe(
      redactEngineSig(settings, ["company", "name"]),
    );
  });
});
