import { describe, expect, it } from "vitest";
import { appendToProfile, dedupeProfile, profileSentences } from "./profile";

/* The reported profile, verbatim: six phrasings of ONE preference piled up because the
   old dedup was plain string containment — « des » vs « les », « préférant »,
   « Doivent être courtes » are all different strings. Coverage over CONTENT words with
   inflection-tolerant stems is what resolves them to one. */
const REPORTED =
  "Préfère des réponses courtes en français. " +
  "cheffe de produit dans une entreprise SaaS B2B, préfère communiquer en français " +
  "Utilisateur préférant les réponses courtes en français " +
  "Préfère les réponses courtes en français " +
  "préfère des réponses courtes, en français " +
  "Doivent être courtes et en français. " +
  "s’appelle Claire";

describe("dedupeProfile — the reported six-copies profile collapses to the facts", () => {
  it("keeps one copy of the preference, the job line and the name — drops the rephrasings", () => {
    const out = dedupeProfile(REPORTED)!;
    // One preference phrasing survives (the oldest), the job + name stay.
    expect(out).toContain("Préfère des réponses courtes en français.");
    expect(out).toContain("cheffe de produit");
    expect(out).toContain("SaaS B2B");
    expect(out).toContain("Claire");
    // Every rephrasing is gone.
    expect(out).not.toContain("Utilisateur préférant");
    expect(out).not.toContain("Préfère les réponses courtes");
    expect(out).not.toContain("Doivent être courtes");
    expect(out.match(/réponses courtes/g)).toHaveLength(1);
  });

  it("is idempotent, and returns the SAME reference when nothing is redundant", () => {
    const once = dedupeProfile(REPORTED)!;
    expect(dedupeProfile(once)).toBe(once);
    const clean = "Développeur senior. Préfère le tutoiement.";
    expect(dedupeProfile(clean)).toBe(clean);
  });

  it("never rewrites kept text — a no-drop profile round-trips verbatim", () => {
    const authored = "Travaille chez Berlioz Avocats. Basée à Lyon, s’occupe du dossier Ondine.";
    expect(dedupeProfile(authored)).toBe(authored);
  });
});

describe("appendToProfile — a rephrased preference never lands twice", () => {
  const base = "Préfère des réponses courtes en français.";

  it("skips every rephrasing of an already-covered fact", () => {
    for (const piece of [
      "Préfère les réponses courtes en français",
      "préfère des réponses courtes, en français",
      "Utilisateur préférant les réponses courtes en français",
      "Doivent être courtes et en français.",
    ]) {
      const r = appendToProfile(base, [piece]);
      expect(r.changed, piece).toBe(false);
      expect(r.profile).toBe(base);
    }
  });

  it("appends a piece that carries at least one NEW fact", () => {
    const r = appendToProfile(base, ["Préfère aussi le tutoiement"]);
    expect(r.changed).toBe(true);
    expect(r.profile).toContain("tutoiement");
    // And a mixed piece (new + redundant) is kept whole — dropping needs FULL coverage.
    const mixed = appendToProfile(base, ["cheffe de produit, préfère communiquer en français"]);
    expect(mixed.changed).toBe(true);
    expect(mixed.profile).toContain("cheffe de produit");
  });

  it("dedups WITHIN one run too (profil + a routed preference note)", () => {
    const r = appendToProfile(undefined, [
      "Préfère des réponses courtes en français.",
      "Préfère les réponses courtes en français",
    ]);
    expect(r.profile).toBe("Préfère des réponses courtes en français.");
  });
});

describe("profileSentences — the glued legacy blob splits where the appends happened", () => {
  it("splits on punctuation AND before a mid-blob Capitalized word", () => {
    const parts = profileSentences(
      "Préfère des réponses courtes en français. cheffe de produit Utilisateur préférant les réponses",
    );
    expect(parts[0]).toBe("Préfère des réponses courtes en français.");
    expect(parts.some((p) => p.startsWith("Utilisateur"))).toBe(true);
  });
});
