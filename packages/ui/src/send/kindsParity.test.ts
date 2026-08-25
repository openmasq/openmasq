import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { redact, redactionCategory, type RedactionMatch } from "@openmasq/redact";
import { deriveRedactedSpans } from "./sendAnalytics";

/**
 * `Conversation.redactionKinds` (REAL value → category) has THREE producers — the message
 * pass, the tool-result pass and the document pass — and every reader treats it as one
 * map. Nothing made them agree, and twice they didn't:
 *
 *  - the DOCUMENT pass classified with `redactionKind` (8 coarse colour buckets), so a
 *    PDF's addresses were filed under « Clés & secrets » and painted red;
 *  - the TOOL pass required `m.category`, the MODEL's semantic tag, which no
 *    deterministic-rule match carries — so every IBAN/card/phone/e-mail/IP/SIREN in a
 *    Gmail or Drive result was recorded with no kind at all.
 *
 * Both compiled. Both shipped. Neither could be caught by the type system: the coarse
 * union is a SUBSET of the fine one, so one assigns to the other silently, and the map
 * itself is `Record<string, string>`.
 *
 * This file is the agreement, expressed once. The document pass has its own value-for-
 * value twin next to main (`apps/desktop/src/main/ipc/documentKinds.parity.test.ts`);
 * this one owns the renderer's two and the RULE that binds all three.
 */

/** A document mixing rule-detected values (no `category`) and free-form PII. */
const SAMPLE = [
  "IBAN FR7630006000011234567890189 · carte 4970 1000 0000 0006",
  "tel 06 12 34 56 78 · mail serviceclient@greffe-tc.example",
  "SIREN 863 471 587 · IP 192.168.1.42",
  "61 R DE LYON, 75012 PARIS",
].join("\n");

/** The tool pass's recorder, mirrored from `toolResult.ts` `recordKinds`. */
const toolPassKinds = (matches: readonly RedactionMatch[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of matches) if (m.value) out[m.value] = redactionCategory(m.category ?? m.type);
  return out;
};

describe("every producer of `redactionKinds` classifies the same way", () => {
  const matches = redact(SAMPLE).matches;

  it("the sample actually exercises the gap — rule matches carry NO `category`", () => {
    // The tool bug was invisible without this: `category` is the model's tag, so a test
    // written on model detections alone would have passed throughout.
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => !m.category), "no rule-only match left in the sample").toBe(true);
  });

  it("message pass and tool pass agree value-for-value", () => {
    const message = Object.fromEntries(deriveRedactedSpans([...matches]).map((s) => [s.value, s.kind]));
    expect(toolPassKinds(matches)).toEqual(message);
  });

  it("no producer records a rule match as « secret » by default", () => {
    // The shared failure mode: a value the engine typed precisely, filed under the
    // catch-all — which is a real category, so nothing downstream can tell it apart.
    const kinds = Object.values(toolPassKinds(matches));
    expect(kinds.every((k) => k === "secret")).toBe(false);
    expect(kinds).toContain("iban");
    expect(kinds).toContain("email");
  });

  it("the tool recorder does not require the model's `category` tag", () => {
    // Reading the source is the only way to pin the CONDITION rather than its effect,
    // and the condition is what regressed. The effect is pinned by the tests above.
    const src = readFileSync(join(__dirname, "toolResult.ts"), "utf8");
    expect(src).toMatch(/toolKinds\[m\.value\] = redactionCategory\(m\.category \?\? m\.type\)/);
    expect(src, "requiring `m.category` drops every deterministic-rule match").not.toMatch(
      /if \(m\.value && m\.category\)/,
    );
  });
});
