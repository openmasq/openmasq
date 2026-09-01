import { describe, expect, it } from "vitest";
import { trimSpanEdges, stripCivilStatusPrefix, stripTrailingEmailParen, stripBankOpPrefix } from "./spanEdges";
import { NOTORIOUS_COMMERCIAL_ORGS } from "../notoriousData";

/**
 * A poorly bounded span doesn't just break display: the value stops being ITSELF
 * for anything that compares strings. Measured on a real tool result (04/08
 * log): the brand « Github, » — with a glued comma — used to be redacted even though
 * « Github » is in the notoriety list.
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
    // « ST OUEN (93400) »: trimming them broke restoring the city alone
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
  // The real-world case (observed 13/08, replayed 15/08): the detector glues « née » into the
  // name's span. Treated as a name token, « née » got its own fake and the civil
  // status disappeared from the wire — « née de La Roncheraye » → « sidonie de La
  // Guilbaud », which the model reads back as another person. The deed becomes unfaithful.
  it("dépouille née/épouse/veuve/dit en tête, et eux seuls", () => {
    expect(stripCivilStatusPrefix("née de La Roncheraye")).toBe("de La Roncheraye");
    expect(stripCivilStatusPrefix("Née Perrichon")).toBe("Perrichon");
    expect(stripCivilStatusPrefix("né Morvan")).toBe("Morvan");
    expect(stripCivilStatusPrefix("épouse N'Dranoh")).toBe("N'Dranoh");
    expect(stripCivilStatusPrefix("veuve Trégastel")).toBe("Trégastel");
    expect(stripCivilStatusPrefix("dite Mimi")).toBe("Mimi");
    expect(stripCivilStatusPrefix("épouse née Kervalec")).toBe("Kervalec"); // repeated
  });

  it("ne touche ni un nom ordinaire, ni un nom qui COMMENCE comme un marqueur", () => {
    expect(stripCivilStatusPrefix("Marie-Claire de La Roncheraye")).toBe(
      "Marie-Claire de La Roncheraye",
    );
    // « Née » is a marker only at the START and followed by a word — a surname that
    // resembles it with nothing after stays intact.
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
    // Parentheses are deliberately spared (« ST OUEN (93400) » carries meaning): the
    // trim only targets those that contain an address.
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
    // « Virement » is not « VIR », « Chquette » is not « CHQ »: whole words only.
    expect(stripBankOpPrefix("Virement Rebour")).toBe("Virement Rebour");
    expect(stripBankOpPrefix("Remisier Conseil")).toBe("Remisier Conseil");
  });

  it("ne vide jamais un span réduit à un code", () => {
    expect(stripBankOpPrefix("VIR")).toBe("VIR");
    expect(stripBankOpPrefix("CHQ 4412")).toBe("CHQ 4412");
  });
});
