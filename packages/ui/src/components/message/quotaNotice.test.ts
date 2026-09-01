import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { quotaNotice } from "./quotaNotice";

const resetTomorrow2h = new Date().setHours(24 + 2, 0, 0, 0);

/* The thresholds and formatting tested here don't depend on the language; the
   French catalogue serves as witness. */
const t = getMessages("fr");

describe("quotaNotice — prévenir tant qu'il reste de la marge", () => {
  it("se tait tant que la fin n'est pas proche", () => {
    // The reported turn was consuming the quota without a word until zero; the opposite —
    // a caption on every reply — would stop being read.
    expect(quotaNotice(t, { remaining: 42, limit: 50 })).toBeNull();
    expect(quotaNotice(t, undefined)).toBeNull();
  });

  it("parle sur les dernières requêtes, avec le compte et la reprise", () => {
    const msg = quotaNotice(t, { remaining: 3, limit: 50, resetAt: resetTomorrow2h })!;
    expect(msg).toContain("3 requêtes");
    expect(msg).toContain("sur 50");
    expect(msg).toContain("demain à 02:00");
  });

  it("accorde le singulier", () => {
    expect(quotaNotice(t, { remaining: 1, limit: 50 })).toContain("1 requête sur");
  });

  it("zéro est un MUR, pas un décompte", () => {
    const msg = quotaNotice(t, { remaining: 0, limit: 50, resetAt: resetTomorrow2h })!;
    expect(msg).toContain("épuisé");
    expect(msg).toContain("Changez de modèle");
    expect(msg).not.toMatch(/il reste 0/i);
  });

  it("un GRAND plafond prévient sur son dernier dixième, pas sur cinq requêtes", () => {
    // 1000/day: being warned at 5 remaining leaves nothing to do.
    expect(quotaNotice(t, { remaining: 80, limit: 1000 })).toContain("80 requêtes");
    expect(quotaNotice(t, { remaining: 300, limit: 1000 })).toBeNull();
  });

  it("sans plafond annoncé, le seuil bas suffit", () => {
    expect(quotaNotice(t, { remaining: 2 })).toContain("2 requêtes");
    expect(quotaNotice(t, { remaining: 2 })).not.toMatch(/\(sur \d+\)/);
    expect(quotaNotice(t, { remaining: 9 })).toBeNull();
  });

  it("ne dit rien d'un compteur absurde plutôt que d'inventer", () => {
    expect(quotaNotice(t, { remaining: -1 })).toBeNull();
  });
});
