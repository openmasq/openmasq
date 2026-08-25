import { describe, it, expect } from "vitest";
import { redact, redactionCategory, redactionKind } from "@openmasq/redact";
import { makeDocumentScrub } from "./documentScrub";

/**
 * A document's redaction runs in MAIN (`files:redact-and-save`) while a message's runs in
 * the renderer — two passes writing into ONE map, the conversation's `redactionKinds`.
 * Nothing made them agree, and they didn't: main classified with `redactionKind` (8 coarse
 * COLOUR buckets) where every reader treats that map as the FINE, user-facing category.
 * Both take a string and return a string, so the wrong one compiled, shipped, and filed a
 * PDF's addresses under « Clés & secrets », painted red.
 *
 * This is the parity a comment cannot enforce (root rule 9).
 */

/** The categories the message pass produces for a text — what main must match. */
const messagePassKinds = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of redact(text).matches) out[m.value] = redactionCategory(m.category ?? m.type);
  return out;
};

// The user's own case (an INPI filing receipt): a name, a street, a city, a company id,
// an e-mail — precisely the families the coarse bucket collapses.
const DOCUMENT = [
  "SABOURDIN",
  "36 AV DU CAPITAINE GLARNER",
  "93400 ST OUEN SUR SEINE",
  "Dénomination : Karl Studio    Numéro RCS : 863 471 587",
  "Adresse 61 R DE LYON",
  "        75012 PARIS",
  "email serviceclient@greffe-tc.example",
].join("\n");

describe("the document pass classifies exactly like the message pass", () => {
  it("agrees value-for-value", () => {
    // THE regression. Before the fix, every address/location/id here came back "secret"
    // from main while the message pass gave its real category — same value, same
    // conversation, two answers.
    const { scrub, kinds } = makeDocumentScrub({});
    scrub(DOCUMENT);
    expect(kinds).toEqual(messagePassKinds(DOCUMENT));
  });

  it("does not file a whole document under « secret »", () => {
    const { scrub, kinds } = makeDocumentScrub({});
    scrub(DOCUMENT);
    const cats = Object.values(kinds);
    expect(cats.length, "the engine detected nothing — the fixture drifted").toBeGreaterThan(0);
    expect(
      cats.every((c) => c === "secret"),
      `everything landed on "secret": ${JSON.stringify(kinds)}`,
    ).toBe(false);
  });

  it("the two classifiers genuinely DIVERGE — so the choice is not cosmetic", () => {
    // Keeps the parity above from going vacuous: if these ever converge, the test no
    // longer proves anything, and this says so instead of passing quietly.
    for (const cat of [
      "address", "location", "city", "postal_code", "national_id", "dob",
      "date", "iban", "bic", "card", "url", "salary", "company_id",
    ])
      expect(redactionKind(cat), `${cat} no longer diverges`).not.toBe(redactionCategory(cat));
    expect(redactionKind("address")).toBe("secret");
    expect(redactionCategory("address")).toBe("address");
  });
});

describe("makeDocumentScrub — the rest of its contract", () => {
  it("reuses the vault across runs, so one value keeps ONE substitute", () => {
    // A document is scrubbed run by run. A second fake for the same value would make the
    // reply impossible to restore — the vault is mutated on purpose for this.
    const vault: Record<string, string> = {};
    const { scrub } = makeDocumentScrub(vault);
    const a = scrub("Contact : serviceclient@greffe-tc.example");
    const b = scrub("Relance : serviceclient@greffe-tc.example");
    expect(a.pairs[0].to).toBe(b.pairs[0].to);
  });

  it("dedupes `spans` by value while `kinds` keeps every value", () => {
    const { scrub, spans, kinds } = makeDocumentScrub({});
    scrub("a@b.fr puis a@b.fr encore");
    expect(spans.filter((s) => s.value === "a@b.fr")).toHaveLength(1);
    expect(kinds["a@b.fr"]).toBe("email");
  });

  it("honours disabledKinds — a category switched off is not masked at all", () => {
    const { scrub, kinds } = makeDocumentScrub({}, ["email"]);
    const out = scrub("email a@b.fr");
    expect(out.text).toContain("a@b.fr");
    expect(kinds["a@b.fr"]).toBeUndefined();
  });
});
