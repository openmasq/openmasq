import { describe, expect, it } from "vitest";
import {
  resolveBoxReveal,
  layoutValueHits,
  valueBoxRanges,
  ocrFallbackBoxes,
  type PdfReplacement,
} from "./pdfMatch";
import { vaultReplacements, pdfReplacements, type RedactFn } from "./pdfDerive";
import { reconstructLayout, type PdfTextItem } from "../documents/pdfLayout";

const rep = (real: string): PdfReplacement => ({ real, fake: "X".repeat(real.length), tone: "coral" });

// layoutValueHits correlates each value with the pdf.js items it spans by matching on
// the RECONSTRUCTED page text and mapping back through `runs` — the fix for values a
// per-item matcher silently dropped (split across items / grid padding), which left
// them in CLEAR in the "document redacted" while the text wire was fine.
describe("layoutValueHits", () => {
  // The user-reported repro: a notarial line where pdf.js splits the sentence into
  // several text items, the address straddling TWO of them.
  const ITEMS: PdfTextItem[] = [
    { str: "Suite à l'annulation de la part du vendeur de la vente", transform: [10, 0, 0, 10, 50, 700], width: 260 },
    { str: "du bien situé", transform: [10, 0, 0, 10, 50, 685], width: 65 },
    { str: "52 impasse des Roses,", transform: [10, 0, 0, 10, 120, 685], width: 105 },
    { str: "64000 PAU", transform: [10, 0, 0, 10, 230, 685], width: 50 },
  ];
  const layout = reconstructLayout(ITEMS);
  const address = /52 impasse des Roses, +64000 PAU/.exec(layout.text)![0];

  it("REGRESSION: a value SPLIT ACROSS pdf.js items gets segments in EVERY item it spans", () => {
    const { hits, covered } = layoutValueHits(layout, [rep(address)]);
    expect(covered.has(address)).toBe(true);
    expect(hits).toHaveLength(1);
    // Both source items are painted — the address is fully covered, item 2 AND item 3.
    expect(hits[0].segments.map((s) => s.itemIndex).sort()).toEqual([2, 3]);
    // The segment slices are exactly the per-item parts of the address.
    const slices = hits[0].segments.map((s) => ITEMS[s.itemIndex].str.slice(s.start, s.end));
    expect(slices).toEqual(["52 impasse des Roses,", "64000 PAU"]);
  });

  it("whitespace-FLEXIBLE: a single-spaced vault value matches grid padding and line breaks", () => {
    // The layout grid may pad the gap ("Roses,   64000") or break the line — a vault
    // value from another serialization is single-spaced. \s+ bridges all of it.
    const single = "52 impasse des Roses, 64000 PAU";
    const { covered } = layoutValueHits(layout, [rep(single)]);
    expect(covered.has(single)).toBe(true);
  });

  it("a value only ever inside a LONGER painted value is covered WITHOUT its own hit", () => {
    const { hits, covered } = layoutValueHits(layout, [rep(address), rep("64000 PAU")]);
    expect(hits).toHaveLength(1); // only the address paints (longest first)
    expect(covered.has(address)).toBe(true);
    expect(covered.has("64000 PAU")).toBe(true); // its pixels lie under the address box
  });

  it("a value ABSENT from the page is neither hit nor covered (the send gate refuses it)", () => {
    const { hits, covered } = layoutValueHits(layout, [rep("valeur d'un tampon OCR")]);
    expect(hits).toHaveLength(0);
    expect(covered.size).toBe(0);
  });

  it("skips a value glued inside a larger word — not a real span, not covered", () => {
    const glued = reconstructLayout([
      { str: "INGÉNIEURS PARIS", transform: [10, 0, 0, 10, 50, 700], width: 90 },
    ]);
    const { hits, covered } = layoutValueHits(glued, [rep("PA")]);
    expect(hits).toHaveLength(0);
    expect(covered.has("PA")).toBe(false);
  });

  it("emits one hit per repeated standalone occurrence", () => {
    const twice = reconstructLayout([
      { str: "a@b.com et a@b.com", transform: [10, 0, 0, 10, 50, 700], width: 100 },
    ]);
    const { hits } = layoutValueHits(twice, [rep("a@b.com")]);
    expect(hits).toHaveLength(2);
  });

  it("keeps the LONGER value's paint when a shorter one overlaps it (one box set, no double-paint)", () => {
    const line = reconstructLayout([
      { str: "Contact Jean Rebour ici", transform: [10, 0, 0, 10, 50, 700], width: 120 },
    ]);
    const { hits } = layoutValueHits(line, [rep("Jean"), rep("Jean Rebour")]);
    expect(hits).toHaveLength(1);
    const s = hits[0].segments[0];
    expect("Contact Jean Rebour ici".slice(s.start, s.end)).toBe("Jean Rebour");
  });
});

// valueBoxRanges is the OCR path's box source (`imageRedact.ts`): one tight range per
// standalone value in a single reconstructed string.
describe("valueBoxRanges", () => {
  it("returns one range per standalone value, sorted by start", () => {
    const s = "Nom: Jean Rebour, tel 0612345678";
    const r = valueBoxRanges(s, [rep("0612345678"), rep("Jean Rebour")]);
    expect(r.map((x) => s.slice(x.start, x.end))).toEqual(["Jean Rebour", "0612345678"]);
  });

  it("keeps the LONGER value when a shorter one overlaps it", () => {
    const s = "Contact Jean Rebour ici";
    const r = valueBoxRanges(s, [rep("Jean"), rep("Jean Rebour")]);
    expect(r).toHaveLength(1);
    expect(s.slice(r[0].start, r[0].end)).toBe("Jean Rebour");
  });

  it("skips a value only glued inside a larger word", () => {
    expect(valueBoxRanges("INGÉNIEURS PARIS", [rep("PA")])).toHaveLength(0);
  });

  it("emits one range per repeated standalone occurrence", () => {
    expect(valueBoxRanges("a@b.com et a@b.com", [rep("a@b.com")])).toHaveLength(2);
  });

  it("whitespace-FLEXIBLE: a single-spaced value matches padded OCR layout text", () => {
    const s = "situé  52 impasse des Roses,   64000 PAU";
    const r = valueBoxRanges(s, [rep("52 impasse des Roses, 64000 PAU")]);
    expect(r).toHaveLength(1);
    expect(s.slice(r[0].start, r[0].end)).toBe("52 impasse des Roses,   64000 PAU");
  });
});

// resolveBoxReveal is the reveal-skips-paint core: given a text item's hits +
// the user's reveal set, which values stay faked (painted) vs kept in clear.
describe("resolveBoxReveal", () => {
  const email: PdfReplacement = { real: "a@b.com", fake: "x@y.fr", tone: "blue" };
  const name: PdfReplacement = { real: "Marie", fake: "Chloé", tone: "violet" };

  it("with no reveal set, EVERY hit is still painted (active = all)", () => {
    const r = resolveBoxReveal([email, name]);
    expect(r.active).toEqual([email, name]);
    expect(r.primary).toBe(email);
    expect(r.revealed).toBe(false);
  });

  it("a revealed value is dropped from active (kept in clear) and flagged", () => {
    const r = resolveBoxReveal([email], new Set(["a@b.com"]));
    expect(r.active).toEqual([]); // nothing left to paint → glyphs stay clean
    expect(r.revealed).toBe(true);
  });

  it("in a multi-value item, only the revealed value is kept in clear", () => {
    const r = resolveBoxReveal([email, name], new Set(["Marie"]));
    expect(r.active).toEqual([email]); // email still faked, Marie in clear
    expect(r.primary).toBe(email); // primary (hits[0]) not revealed
    expect(r.revealed).toBe(false);
  });

  it("only the EXACT real value is revealed — never a substring/other value", () => {
    const r = resolveBoxReveal([email, name], new Set(["Chloé", "a@b"])); // fake + partial
    expect(r.active).toEqual([email, name]); // neither matches a real → all painted
    expect(r.revealed).toBe(false);
  });
});

// vaultReplacements is the DETERMINISTIC, model-free path used to re-render an
// already-sent document's redaction from the conversation vault (fake→original).
describe("vaultReplacements", () => {
  it("inverts the vault into real→fake pairs with a tone per value", () => {
    const reps = vaultReplacements(
      { "Paris": "Brest", "a@b.com": "chloe@hotmail.fr" },
      { Brest: "location", "chloe@hotmail.fr": "email" },
    );
    const byReal = Object.fromEntries(reps.map((r) => [r.real, r.fake]));
    expect(byReal["Brest"]).toBe("Paris");
    expect(byReal["chloe@hotmail.fr"]).toBe("a@b.com");
    // Every entry carries a (string) tone, even when kinds is missing.
    expect(reps.every((r) => typeof r.tone === "string")).toBe(true);
  });

  it("sorts longest real first and de-dupes / skips empties", () => {
    const reps = vaultReplacements({ f1: "ab", f2: "abcdef", f3: "", f4: "abcdef" });
    expect(reps.map((r) => r.real)).toEqual(["abcdef", "ab"]); // longest first, empty dropped, dup collapsed
  });

  it("returns [] for an empty vault", () => {
    expect(vaultReplacements({})).toEqual([]);
  });
});

// Multi-chunk safety — a big document is redacted in chunks; these guard against the
// two leaks the chunking used to have: a cross-chunk FAKE COLLISION dropping a real
// value from the vault (→ sent in clear), and a value STRADDLING a chunk boundary
// being missed entirely (→ sent in clear).
describe("pdfReplacements — multi-chunk safety", () => {
  it("never lets two DIFFERENT reals share a fake, even with a colliding redact fn", async () => {
    // Worst case: a redact fn that IGNORES the shared vault and hands the SAME fake to
    // whatever it detects (simulates a pool collision / a caller not threading the vault).
    const colliding: RedactFn = async (text) => ({
      text,
      matches: ["Alpha", "Bravo"]
        .filter((s) => text.includes(s))
        .map((s) => ({ type: "secret", value: s, placeholder: "SAMEFAKE", category: "NAME" })),
    });
    // Force ≥2 chunks with the two names in DIFFERENT chunks.
    const filler = "lorem ipsum ".repeat(700); // ~8.4k
    const text = `Alpha ${filler}\n${filler} Bravo`;
    const { replacements } = await pdfReplacements(text, colliding);
    expect(replacements.map((r) => r.real).sort()).toEqual(["Alpha", "Bravo"]);
    // DISTINCT fakes → both values are reversible; neither is clobbered out of the vault.
    expect(new Set(replacements.map((r) => r.fake)).size).toBe(2);
  });

  it("threads ONE shared vault across every chunk (fakes stay atomic)", async () => {
    const vaults: (Record<string, string> | undefined)[] = [];
    const redact: RedactFn = async (text, _sig, vault) => {
      vaults.push(vault);
      if (!text.includes("Zephyr")) return { text, matches: [] };
      const existing = vault && Object.entries(vault).find(([, real]) => real === "Zephyr")?.[0];
      const fake = existing ?? "Qorvex";
      if (vault) vault[fake] = "Zephyr";
      return { text, matches: [{ type: "secret", value: "Zephyr", placeholder: fake, category: "NAME" }] };
    };
    const filler = "word ".repeat(1400);
    const { replacements } = await pdfReplacements(`Zephyr ${filler}\n${filler} Zephyr`, redact);
    expect(replacements).toHaveLength(1); // deduped by real value
    expect(vaults.length).toBeGreaterThan(1); // multiple chunks
    expect(vaults.every((v) => v === vaults[0])).toBe(true); // the SAME vault object each time
    expect(vaults[0]).toEqual({ Qorvex: "Zephyr" }); // it accumulated
  });

  it("detects a value STRADDLING a chunk boundary (overlap recovery)", async () => {
    const secret = "STRADDLINGSECRET";
    // One long line (no whitespace) with the value spanning the ~6000-char cut.
    const text = "x".repeat(5995) + secret + "y".repeat(7000);
    const redact: RedactFn = async (t) => ({
      text: t,
      matches: t.includes(secret)
        ? [{ type: "secret", value: secret, placeholder: "REDACTED", category: "SECRET" }]
        : [],
    });
    const { replacements } = await pdfReplacements(text, redact);
    expect(replacements.map((r) => r.real)).toContain(secret);
  });
});

describe("ocrFallbackBoxes — the scanned-page fallback of the PDF painter", () => {
  const words = [
    { text: "Jean", x0: 100, y0: 50, x1: 180, y1: 80, confidence: 95 },
    { text: "Rebour", x0: 190, y0: 50, x1: 300, y1: 80, confidence: 95 },
    { text: "Facture", x0: 100, y0: 120, x1: 240, y1: 150, confidence: 95 },
  ];
  const page = { words, width: 1000, height: 500 };
  const rep = { real: "Jean Rebour", fake: "Hugo Cros", tone: "coral" };

  it("paints a value the text layer left uncovered, scaled raster→canvas", () => {
    const { boxes, covered } = ocrFallbackBoxes([rep], new Set(), page, 2, 3);
    expect(boxes).toHaveLength(1);
    // union of the two word boxes (100..300 × 50..80), then ×2 / ×3
    expect(boxes[0]).toMatchObject({ left: 200, top: 150, w: 400, h: 90, real: "Jean Rebour" });
    expect([...covered]).toEqual(["Jean Rebour"]);
  });

  it("skips a value the TEXT layer already covered (no double boxes on a mixed page)", () => {
    const { boxes, covered } = ocrFallbackBoxes([rep], new Set(["Jean Rebour"]), page, 1, 1);
    expect(boxes).toEqual([]);
    expect(covered.size).toBe(0);
  });

  it("a value the OCR reading does not spell yields nothing (gate stays fail-closed)", () => {
    const { boxes, covered } = ocrFallbackBoxes(
      [{ real: "165031874259690", fake: "0000", tone: "blue" }],
      new Set(), page, 1, 1,
    );
    expect(boxes).toEqual([]);
    expect(covered.size).toBe(0);
  });

  it("a revealed value keeps its box but flagged revealed (painter skips the paint)", () => {
    const { boxes } = ocrFallbackBoxes([rep], new Set(), page, 1, 1, new Set(["Jean Rebour"]));
    expect(boxes[0]?.revealed).toBe(true);
  });
});

describe("pdfReplacements — coffre PARTAGÉ entre documents (15/08/2026)", () => {
  /** A minimal but REALISTIC allocator: it reuses the fake already assigned to a
   *  value in the vault it's given, and only mints a new one otherwise. */
  // ⚠️ The shared vault is `RedactFn`'s 3rd parameter (after `signal`), not an
  // options object: this is the signature `pdfReplacements` honours.
  const redact: RedactFn = async (text, _signal, sharedVault) => {
    const vault = sharedVault ?? {};
    const matches: { value: string; placeholder: string; category: string }[] = [];
    for (const real of ["Sabourdin Julien", "Karl Studio"]) {
      if (!text.includes(real)) continue;
      const deja = Object.entries(vault).find(([, v]) => v === real)?.[0];
      const fake = deja ?? `${real === "Karl Studio" ? "Voxa Lab" : "Anselme Sauvestre"}-${Object.keys(vault).length}`;
      vault[fake] = real;
      matches.push({ value: real, placeholder: fake, category: "NAME" });
    }
    return { text, matches } as never;
  };

  it("la MÊME personne, dans DEUX documents, garde UN seul faux", async () => {
    // The real case: the Kbis extract names the director, the agreement in principle names
    // the borrower. Without a shared vault, each mints its own and the model sees two
    // people — it answered "these documents don't name the same person".
    const vault: Record<string, string> = {};
    const p1 = await pdfReplacements("Président : Sabourdin Julien — Karl Studio", redact, { vault });
    const p2 = await pdfReplacements("Emprunteur : Sabourdin Julien", redact, { vault });
    const faux = (r: { replacements: { real: string; fake: string }[] }, real: string) =>
      r.replacements.find((x) => x.real === real)?.fake;
    expect(faux(p1, "Sabourdin Julien")).toBeTruthy();
    expect(faux(p2, "Sabourdin Julien")).toBe(faux(p1, "Sabourdin Julien"));
  });

  it("sans coffre partagé, le comportement d'avant est inchangé (un coffre par appel)", async () => {
    const p1 = await pdfReplacements("Président : Sabourdin Julien", redact);
    const p2 = await pdfReplacements("Emprunteur : Sabourdin Julien", redact);
    expect(p1.replacements[0]?.fake).toBeTruthy();
    expect(p2.replacements[0]?.fake).toBeTruthy();
  });
});
