import { describe, expect, it } from "vitest";
import { trimSpanEdges, stripCivilStatusPrefix, stripTrailingEmailParen, stripBankOpPrefix } from "./spanEdges";
import { NOTORIOUS_COMMERCIAL_ORGS } from "../notoriousData";

/**
 * Un span mal borné ne casse pas seulement l'affichage : la valeur cesse d'être ELLE-MÊME
 * pour tout ce qui compare des chaînes. Mesuré sur un vrai résultat d'outil (journal du
 * 04/08) : la marque « Github, » — virgule collée — partait redacted alors que
 * « Github » figure dans la liste de notoriété.
 */
describe("trimSpanEdges", () => {
  it("rogne la ponctuation de phrase aux DEUX bords", () => {
    expect(trimSpanEdges("Github,")).toBe("Github");
    expect(trimSpanEdges("« Paris »")).toBe("Paris");
    expect(trimSpanEdges("Karl Studio.")).toBe("Karl Studio");
    expect(trimSpanEdges("...Metz!")).toBe("Metz");
  });

  it("préserve ce qui est INTERNE à la valeur", () => {
    for (const v of ["Jean-Claude", "L'Oréal", "Saint-Étienne", "augustin#4521", "a.vaudel"])
      expect(trimSpanEdges(v)).toBe(v);
  });

  it("⚠️ ne touche pas aux PARENTHÈSES — elles portent du sens dans un lieu composite", () => {
    // « ST OUEN (93400) » : les rogner cassait la restitution de la ville seule
    // (`placeAliases.test.ts`).
    expect(trimSpanEdges("ST OUEN (93400)")).toBe("ST OUEN (93400)");
  });

  it("ne rend jamais une chaîne vide", () => {
    expect(trimSpanEdges("...")).toBe("...");
    expect(trimSpanEdges("  ")).toBe("");
  });

  it("REND la marque à la liste de notoriété — l'effet qui comptait", () => {
    const list = NOTORIOUS_COMMERCIAL_ORGS as unknown as string[];
    const known = (v: string) => list.some((x) => String(x).toLowerCase() === v.toLowerCase());
    expect(known("Github,"), "la valeur collée n'y est pas, c'était le bug").toBe(false);
    expect(known(trimSpanEdges("Github,")), "rognée, elle y est").toBe(true);
  });
});

describe("stripCivilStatusPrefix — l'état civil n'est pas un prénom", () => {
  // Le cas vécu (constat 13/08, rejoué 15/08) : le détecteur colle « née » dans le span
  // du nom. Traité comme un jeton de nom, « née » recevait son propre faux et l'état
  // civil disparaissait du wire — « née de La Roncheraye » → « sidonie de La
  // Guilbaud », que le modèle relit comme une autre personne. L'acte devient infidèle.
  it("dépouille née/épouse/veuve/dit en tête, et eux seuls", () => {
    expect(stripCivilStatusPrefix("née de La Roncheraye")).toBe("de La Roncheraye");
    expect(stripCivilStatusPrefix("Née Perrichon")).toBe("Perrichon");
    expect(stripCivilStatusPrefix("né Morvan")).toBe("Morvan");
    expect(stripCivilStatusPrefix("épouse N'Dranoh")).toBe("N'Dranoh");
    expect(stripCivilStatusPrefix("veuve Trégastel")).toBe("Trégastel");
    expect(stripCivilStatusPrefix("dite Mimi")).toBe("Mimi");
    expect(stripCivilStatusPrefix("épouse née Kervalec")).toBe("Kervalec"); // répété
  });

  it("ne touche ni un nom ordinaire, ni un nom qui COMMENCE comme un marqueur", () => {
    expect(stripCivilStatusPrefix("Marie-Claire de La Roncheraye")).toBe(
      "Marie-Claire de La Roncheraye",
    );
    // « Née » n'est un marqueur qu'en TÊTE et suivi d'un mot — un patronyme qui y
    // ressemble sans espace derrière reste intact.
    expect(stripCivilStatusPrefix("Néel")).toBe("Néel");
    expect(stripCivilStatusPrefix("Veuvey")).toBe("Veuvey");
    expect(stripCivilStatusPrefix("Dittmar")).toBe("Dittmar");
  });

  it("ne vide jamais un span qui n'est QUE le marqueur", () => {
    expect(stripCivilStatusPrefix("née ")).toBe("née ");
  });
});

describe("« Nom (adresse@exemple.fr) » — la parenthèse ne doit pas emporter l'e-mail", () => {
  it("sort l'adresse du span de nom", () => {
    expect(stripTrailingEmailParen("Taavi Remmel (taavi.remmel@exemple.ee)")).toBe("Taavi Remmel");
    expect(stripTrailingEmailParen("Camille Verlant <camille@x.fr>")).toBe("Camille Verlant <camille@x.fr>");
    expect(stripTrailingEmailParen("Awen Kervalec [awen@x.fr]")).toBe("Awen Kervalec");
  });

  it("⚠️ ne touche NI le composite lieu+code NI une parenthèse ordinaire", () => {
    // Les parenthèses sont épargnées exprès (« ST OUEN (93400) » porte du sens) : le
    // rognage ne vise QUE celles qui contiennent une adresse.
    expect(stripTrailingEmailParen("ST OUEN (93400)")).toBe("ST OUEN (93400)");
    expect(stripTrailingEmailParen("Taavi Remmel (bureau 12)")).toBe("Taavi Remmel (bureau 12)");
    expect(stripTrailingEmailParen("Rennes (35)")).toBe("Rennes (35)");
  });

  it("ne vide jamais un span (une parenthèse seule reste aux portes suivantes)", () => {
    expect(stripTrailingEmailParen("(contact@exemple.fr)")).toBe("(contact@exemple.fr)");
  });
});

describe("code d'opération bancaire collé en tête d'un span (grand livre, 15/08/2026)", () => {
  it("le code sort du span, l'entité reste", () => {
    expect(stripBankOpPrefix("VIR SARL REBOUR")).toBe("SARL REBOUR");
    expect(stripBankOpPrefix("CHQ Rebour")).toBe("Rebour");
    expect(stripBankOpPrefix("PRLV. Orange")).toBe("Orange");
    expect(stripBankOpPrefix("vir prlv Régularisation")).toBe("Régularisation");
  });

  it("ne touche pas un mot qui COMMENCE par un code", () => {
    // « Virement » n'est pas « VIR », « Chquette » n'est pas « CHQ » : mots entiers.
    expect(stripBankOpPrefix("Virement Rebour")).toBe("Virement Rebour");
    expect(stripBankOpPrefix("Remisier Conseil")).toBe("Remisier Conseil");
  });

  it("ne vide jamais un span réduit à un code", () => {
    expect(stripBankOpPrefix("VIR")).toBe("VIR");
    expect(stripBankOpPrefix("CHQ 4412")).toBe("CHQ 4412");
  });
});
