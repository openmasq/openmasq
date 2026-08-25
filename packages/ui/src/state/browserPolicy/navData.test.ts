import { describe, it, expect } from "vitest";
import { navCarriesRedactedData, navCarriesOfferableData } from "./index";

/**
 * `navCarriesRedactedData` GRANTS the browser clear-mode relaxation, so every case
 * here pins a direction: `false` = public navigation (clear results, no reveal card),
 * `true` = the call touches redacted data (full path). The unsafe direction is a
 * false `false` — when in doubt these must come out `true`.
 */
describe("navCarriesRedactedData", () => {
  const sensitive = ["Karl Studio", "Julien Sabourdin", "0612345678"];

  it("a clean public query carries nothing (the 'actualité en Espagne' case)", () => {
    const args = { query: "actualité Espagne aujourd'hui" };
    expect(navCarriesRedactedData(args, args, sensitive)).toBe(false);
  });

  it("fires when un-redaction changed the wire (the model embedded a fake)", () => {
    expect(
      navCarriesRedactedData(
        { url: "https://google.com/search?q=Norvik+Group" },
        { url: "https://google.com/search?q=Karl+Studio" },
        sensitive,
      ),
    ).toBe(true);
  });

  it("fires when a sensitive value sits in the wire args even with no token swap", () => {
    const args = { query: "avis clients Karl Studio" };
    expect(navCarriesRedactedData(args, args, sensitive)).toBe(true);
  });

  it("matches a sensitive value variant-tolerantly (casing / slug)", () => {
    const slug = { url: "https://news.example/karl-studio/bilan" };
    expect(navCarriesRedactedData(slug, slug, sensitive)).toBe(true);
    const caps = { query: "KARL STUDIO faillite" };
    expect(navCarriesRedactedData(caps, caps, sensitive)).toBe(true);
  });

  it("ignores a too-short sensitive value (<4 chars — same floor as the nav-exfil scan)", () => {
    const args = { query: "que faire ce week-end" };
    expect(navCarriesRedactedData(args, args, ["ce"])).toBe(false);
  });

  it("empty/no args carry nothing (browser_snapshot & co.)", () => {
    expect(navCarriesRedactedData({}, {}, sensitive)).toBe(false);
    expect(navCarriesRedactedData(undefined, undefined, sensitive)).toBe(false);
  });

  it("no sensitive values at all ⇒ pristine conversation stays clear", () => {
    const args = { url: "https://lemonde.fr/international/" };
    expect(navCarriesRedactedData(args, args, [])).toBe(false);
  });
});

/**
 * `navCarriesOfferableData` gates whether the pre-search REVEAL CARD is shown (not
 * clear-mode). It receives ONLY the vault reals whose category the card can reveal
 * (name/dob/address/location/company), pre-filtered by the caller — so a query carrying
 * only a number/secret (a bare year the number-tokeniser vaulted) must come out `false`
 * and never pop a card that couldn't reveal it. Regression: "ETF 2026" on a PII-free prompt.
 */
describe("navCarriesOfferableData (reveal-card trigger, category-aware)", () => {
  it("false when the query carries only a NON-offerable value (a tokenised year → empty offer list)", () => {
    // The caller filters the vault to offerable categories; a number like 2026 is excluded,
    // so the list handed here is empty even though 2026 sits in the wire URL.
    const args = { url: "https://duckduckgo.com/?q=performance+ETF+PEA+2026+classement" };
    expect(navCarriesOfferableData(args, [])).toBe(false);
  });

  it("true when the query carries an OFFERABLE value (a name the model un-faked into the wire)", () => {
    const wire = { query: "avis clients Karl Studio 2026" };
    expect(navCarriesOfferableData(wire, ["Karl Studio"])).toBe(true);
  });

  it("false when an offerable value is present but under the 4-char floor", () => {
    expect(navCarriesOfferableData({ query: "chez Ax" }, ["Ax"])).toBe(false);
  });

  it("variant-tolerant like its sibling (casing / slug)", () => {
    expect(navCarriesOfferableData({ url: "https://n.ex/karl-studio/x" }, ["Karl Studio"])).toBe(true);
  });

  it("matches a URL-ENCODED offerable value (the model's fake un-faked into an encoded query)", () => {
    // The whole reason the sibling relies on `raw !== wire`: a fake with a space arrives
    // `%20`/`+`-encoded. This predicate has no such signal, so it must decode to still match.
    expect(navCarriesOfferableData({ url: "https://www.google.com/search?q=Karl%20Studio" }, ["Karl Studio"])).toBe(true);
    expect(navCarriesOfferableData({ url: "https://duckduckgo.com/?q=Karl+Studio+avis" }, ["Karl Studio"])).toBe(true);
  });

  it("empty args carry nothing", () => {
    expect(navCarriesOfferableData({}, ["Karl Studio"])).toBe(false);
  });
});
