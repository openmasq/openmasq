import { describe, expect, it } from "vitest";
import { redact, unredact, redactionCategory, type Vault } from "./index";

/** Redact with a fresh vault; assert the value is gone and restorable. */
// ⚠️ `url` OFF = THE PRODUCT DEFAULT (`CATEGORY_DEFAULTS`), and that's what this test
// models: what happens INSIDE a URL we don't mask. The bare engine
// itself has nothing disabled — same asymmetry as `username`, the other category off
// by default. Without this `disabledKinds`, the URL rule claims the whole address and the test
// no longer observes its subject.
function rt(input: string) {
  const vault: Vault = {};
  const { text, matches } = redact(input, { vault, disabledKinds: ["url"] });
  return { text, matches, vault, restored: unredact(text, vault) };
}

describe("new regex rules (on by default)", () => {
  const HIT: Array<[string, string]> = [
    ["Stripe", "sk_live_51H8xAbCdEfGhIjKlMnOpQr"],
    ["Stripe webhook", "whsec_abcdef0123456789ABCDEF"],
    ["GitHub PAT", "github_pat_11ABCDEFG0abcdefghij_KLMNOPqrstuvwx"],
    ["SendGrid", "SG.abcdefghijklmnop.qrstuvwxyz0123456789ABCDEFabcdefghij"],
    ["Twilio", "AC0123456789abcdef0123456789abcdef"],
    ["npm", "npm_abcdefghijklmnopqrstuvwxyz0123456789"],
    ["Google OAuth", "GOCSPX-abcdefghij0123456789KLMNOP"],
    ["Mailgun", "key-0123456789abcdef0123456789abcdef"],
    ["Ethereum", "0xAbC0123456789def0123456789ABCDEF01234567"],
    ["MAC", "3D:F2:C9:0A:1B:8E"],
    ["creds URL", "https://admin:s3cr3t@intranet.corp/login"],
  ];

  for (const [name, value] of HIT) {
    it(`redacts ${name} and restores it`, () => {
      const { text, restored } = rt(`value: ${value}`);
      expect(text).not.toContain(value);
      expect(text).toContain("[REDACTED_");
      expect(restored).toContain(value);
    });
  }

  it("context-gated SIREN/SIRET (Luhn) fires only with the keyword", () => {
    // 775 384 225 is a valid Luhn SIREN (Danone).
    const gated = rt("SIREN 775 384 225 pour la société");
    expect(gated.text).not.toContain("775 384 225");
    // a bare Luhn-valid 9-digit run with no keyword is left alone
    const bare = rt("order number 775384225 shipped");
    expect(bare.text).toContain("775384225");
  });

  it("context-gated BIC fires only with the keyword", () => {
    expect(rt("BIC: BNPAFRPPXXX").text).not.toContain("BNPAFRPPXXX");
    // a plain ALLCAPS word must NOT be redacted
    expect(rt("PROJECT COMPLETE").text).toBe("PROJECT COMPLETE");
  });

  it("BIC keyword may be separated from the code by filler words", () => {
    // Common phrasings where the code doesn't immediately follow the keyword.
    expect(rt("Mon BIC est AGRIFRPP883").text).not.toContain("AGRIFRPP883");
    expect(rt("code BIC : CMCIFRPP").text).not.toContain("CMCIFRPP");
    expect(rt("le BIC de la banque : SOGEFRPP").text).not.toContain("SOGEFRPP");
    expect(rt("SWIFT/BIC BNPAFRPPXXX").text).not.toContain("BNPAFRPPXXX");
    // no keyword nearby → an ALLCAPS word stays untouched (no false positive)
    expect(rt("Le sigle BICYCLETTE ROUGE apparait").text).toContain("BICYCLETTE");
  });

  it("BIC : le guillemet et la parenthèse sont des séparateurs, la clé JSON est en minuscules", () => {
    // Measured on the bench: 3 BIC out of 22 stayed in clear for this reason alone — the
    // serialised pair of a tool result and the value in parentheses of a ticket.
    expect(rt('{"bic":"AGRIFRPP812"}').text).not.toContain("AGRIFRPP812");
    expect(rt("le BIC saisi (BSUIFRPPXXX) est refusé").text).not.toContain("BSUIFRPPXXX");
    expect(rt('bic: "MIDLGB22XXX"').text).not.toContain("MIDLGB22XXX");
    expect(rt("BIC;CEPAFRPP751").text).not.toContain("CEPAFRPP751");
    // …and the value stays STRICTLY in capitals: only the keyword is case-
    // insensitive. Otherwise any eight-letter word following « bic » would be a code.
    expect(rt("bic : le montant reste inchangé").text).toBe("bic : le montant reste inchangé");
  });

  it("a greedy IBAN does not swallow a following BIC (both are redacted)", () => {
    // FR14 … is a valid (mod-97) IBAN; the spaced pattern used to greedily grab
    // the trailing ' BIC BNPAFRPPXXX', fail the checksum, and drop the WHOLE IBAN.
    const { text, restored } = rt("IBAN FR14 2004 1010 0505 0001 3M02 606 BIC BNPAFRPPXXX");
    expect(text).not.toContain("FR14 2004 1010 0505 0001 3M02 606");
    expect(text).not.toContain("BNPAFRPPXXX");
    expect(text).toContain("[REDACTED_IBAN_1]");
    expect(text).toContain("[REDACTED_BIC_1]");
    expect(restored).toBe("IBAN FR14 2004 1010 0505 0001 3M02 606 BIC BNPAFRPPXXX");
  });

  it("UK NINO", () => {
    expect(rt("NI AB123456C").text).not.toContain("AB123456C");
  });

  it("GPS coordinates in range", () => {
    const { text, restored } = rt("Home at 48.85661, 2.35222 exactly");
    expect(text).not.toContain("48.85661, 2.35222");
    expect(restored).toContain("48.85661, 2.35222");
    // a math decimal pair (out of geo range or too few decimals) is untouched
    expect(rt("ratio 3.14, 2.71 here").text).toContain("3.14, 2.71");
  });

  it("all new types map to a category that is ON by default", () => {
    for (const cat of ["api_key", "github_token", "crypto", "mac", "bic", "geo", "connection_string", "national_id"]) {
      // none of them resolve to the opt-in "apikey" bucket
      expect(redactionCategory(cat)).not.toBe("apikey");
    }
    expect(redactionCategory("mac")).toBe("ip");
    expect(redactionCategory("bic")).toBe("iban");
    expect(redactionCategory("geo")).toBe("location");
  });

  it("does NOT redact structured public ids as api-tokens, but still catches a real token", () => {
    // Slugs / tracking codes / ASIN refs / timestamps a model sees while browsing a
    // shopping or search page — `-`/`_`-separated short/word/number segments, no long
    // high-entropy run. They flooded the "Clés & secrets" audit as false positives.
    for (const id of [
      "karl-studio-863471587", // registry slug
      "SanDisk-Cards-Extreme-128GB-Memory", // Amazon product slug (Title-Case)
      "hul_cgw_atf_d_fr_cc_0726_b2g25bj_cta", // Amazon tracking code
      "pd_hp_d_btf_unk_B0F1V4MY7K", // ASIN ref
      "console-2026-07-08T15-38-42-180Z", // timestamped filename
    ]) {
      expect(rt(`voir https://x.fr/e/${id}`).text).toContain(id);
    }
    // A genuine token still redacts: a bare high-entropy run, or a LONG (≥12) mixed
    // letters+digits segment (the hallmark of a real key).
    expect(rt("token Xk7Gp2mNq9wLt4Rv end").text).not.toContain("Xk7Gp2mNq9wLt4Rv");
    expect(rt("key api_9f3a2b1c8e7d6c5b4a end").text).not.toContain("9f3a2b1c8e7d6c5b4a");
  });

  it("does NOT redact percent-encoded URL fragments as api-tokens", () => {
    // A model browsing a site returns percent-encoded URLs; the `\b` between `%` and
    // the hex made the rule capture the encoded tail (`%2Fmakemefamily` → `2Fmakemefamily`)
    // as a "key", flooding the audit. `(?<!%)` blocks a match glued after a `%`.
    const url = "https://x.fr/q=%2Fmakemefamily%2Dsabourdin%25A9couvrez%2Fthomas";
    expect(rt(url).text).toBe(url); // untouched
    for (const frag of ["2Fmakemefamily", "2Dsabourdin", "25A9couvrez"]) {
      expect(rt(`voir %${frag} ici`).text).toContain(frag);
    }
  });
});
