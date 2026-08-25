import { describe, expect, it } from "vitest";
import { quotaNotice } from "./quotaNotice";

const resetTomorrow2h = new Date().setHours(24 + 2, 0, 0, 0);

describe("quotaNotice — prévenir tant qu'il reste de la marge", () => {
  it("se tait tant que la fin n'est pas proche", () => {
    // Le tour signalé consommait le quota sans un mot jusqu'à zéro ; l'inverse — une
    // légende sur chaque réponse — cesserait d'être lu.
    expect(quotaNotice({ remaining: 42, limit: 50 })).toBeNull();
    expect(quotaNotice(undefined)).toBeNull();
  });

  it("parle sur les dernières requêtes, avec le compte et la reprise", () => {
    const msg = quotaNotice({ remaining: 3, limit: 50, resetAt: resetTomorrow2h })!;
    expect(msg).toContain("3 requêtes");
    expect(msg).toContain("sur 50");
    expect(msg).toContain("demain à 02:00");
  });

  it("accorde le singulier", () => {
    expect(quotaNotice({ remaining: 1, limit: 50 })).toContain("1 requête sur");
  });

  it("zéro est un MUR, pas un décompte", () => {
    const msg = quotaNotice({ remaining: 0, limit: 50, resetAt: resetTomorrow2h })!;
    expect(msg).toContain("épuisé");
    expect(msg).toContain("Changez de modèle");
    expect(msg).not.toMatch(/il reste 0/i);
  });

  it("un GRAND plafond prévient sur son dernier dixième, pas sur cinq requêtes", () => {
    // 1000/jour : être averti à 5 restantes ne laisse rien faire.
    expect(quotaNotice({ remaining: 80, limit: 1000 })).toContain("80 requêtes");
    expect(quotaNotice({ remaining: 300, limit: 1000 })).toBeNull();
  });

  it("sans plafond annoncé, le seuil bas suffit", () => {
    expect(quotaNotice({ remaining: 2 })).toContain("2 requêtes");
    expect(quotaNotice({ remaining: 2 })).not.toMatch(/\(sur \d+\)/);
    expect(quotaNotice({ remaining: 9 })).toBeNull();
  });

  it("ne dit rien d'un compteur absurde plutôt que d'inventer", () => {
    expect(quotaNotice({ remaining: -1 })).toBeNull();
  });
});
