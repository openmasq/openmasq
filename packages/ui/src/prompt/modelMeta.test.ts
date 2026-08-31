import { describe, expect, it } from "vitest";
import { fmtTokens, modelMeta } from "./modelMeta";

describe("fmtTokens", () => {
  it("formats k / M compactly", () => {
    expect(fmtTokens(25_000)).toBe("25k");
    expect(fmtTokens(128_000)).toBe("128k");
    expect(fmtTokens(1_000_000)).toBe("1M");
    expect(fmtTokens(2_250_000)).toBe("2.25M");
    expect(fmtTokens(356_250)).toBe("356k");
    expect(fmtTokens(900)).toBe("900");
  });
});

describe("modelMeta", () => {
  it("exposes price + context, and flags a low TPM tier", () => {
    const m = modelMeta("mistral-medium-latest");
    expect(m.price).toBe("0,4/2 $");
    expect(m.context).toBe("256k"); // Mistral Medium 3.5 → 256K window
    expect(m.tpm).toBe("25k/min");
    expect(m.tpmLow).toBe(true); // 25k ≤ 50k → throttling-prone
  });

  it("omits missing data and does not flag a healthy TPM", () => {
    const gpt = modelMeta("gpt-4o");
    expect(gpt.price).toBe("2,5/10 $");
    expect(gpt.context).toBe("128k");
    expect(gpt.tpm).toBeUndefined(); // no TPM data for OpenAI
    expect(gpt.tpmLow).toBe(false);
  });

  /**
   * The glossary changed SHAPE, not requirement (11/08 → 14/08): the inline value
   * is bare (the chip's icon carries the referent — `ModelRow`), and it's the TOOLTIP that
   * OPENS WITH THE WORD then gives the unit. Neither a mute acronym, nor an inline word — both
   * lessons, each pinned here.
   */
  it("le MOT ouvre l'infobulle, la valeur en ligne reste nue", () => {
    const m = modelMeta("mistral-medium-latest");
    expect(m.priceTitle).toMatch(/^Prix — /);
    expect(m.contextTitle).toMatch(/^Contexte — /);
    expect(m.tpmTitle).toMatch(/^Débit — /);
    expect(m.priceTitle).toContain("million de mots");
    expect(m.priceTitle).toContain("ce que vous envoyez");
    // The bare value no longer carries the word: the reclaimed space is the point (14/08).
    for (const v of [m.price, m.context, m.tpm]) {
      expect(v, "la valeur en ligne est nue, le mot vit dans l'infobulle").not.toMatch(/^[A-Z]/);
    }
    // No data ⇒ no orphaned tooltip.
    expect(modelMeta("gpt-4o").tpmTitle).toBeUndefined();
  });

  it("un modèle GRATUIT (0/0) ne porte PAS de chip prix — le badge le dit déjà", () => {
    // Laguna is the free factory default: « 0/0 $ » next to « gratuit » would read
    // as an anomaly, not as information.
    const free = modelMeta("poolside/laguna-s-2.1:free");
    expect(free.price).toBeUndefined();
    expect(free.priceTitle).toBeUndefined();
  });

  it("returns empty meta for an unknown/local model", () => {
    expect(modelMeta("llama3.3")).toEqual({
      price: undefined,
      priceTitle: undefined,
      context: undefined,
      contextTitle: undefined,
      tpm: undefined,
      tpmTitle: undefined,
      tpmLow: false,
    });
  });
});
