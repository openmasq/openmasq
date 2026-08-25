import { describe, it, expect } from "vitest";
import { detectBirthDates } from "./birthDates";

const values = (text: string) => detectBirthDates(text).map((d) => d.value);

describe("detectBirthDates — civil-status prose ('Né à … le <date>')", () => {
  it("detects the date after a birthplace infix, clean and OCR-glued forms", () => {
    expect(values("Né à RENNES (35000) le 23 septembre 1996.")).toEqual(["23 septembre 1996"]);
    // The INVERSE order (date first) also emits the birth CITY: « à Lyon » after the
    // date had NO deterministic detector (the notarial shape needs its parenthesised
    // CP), so an audit corpus shipped « à Villeurbanne » in clear beside a faked name.
    expect(values("Née le 05/07/1990 à Lyon")).toEqual(["Lyon", "05/07/1990"]);
    // OCR gluing: "Néà" and "le17" — the glued "le" stays IN the value, else the
    // bare date is word-glued in the text and applyVault can't substitute it.
    expect(values("Néà NIORT (79000) le17 mars 1993.")).toEqual(["le17 mars 1993"]);
    expect(values("Néà PARIS 18ÈME ARRONDISSEMENT (75018) le9 février 1988.")).toEqual([
      "le9 février 1988",
    ]);
  });

  it("the infix never crosses a sentence end or a line break", () => {
    expect(values("Il est né en Bretagne. Le contrat prend effet le 12 mars 2024.")).toEqual([]);
    expect(values("un projet né hier\nla réunion aura lieu le 12 mars 2024")).toEqual([]);
  });

  it("a date with no birth context is not detected", () => {
    expect(values("L'audience du 16 septembre 2025 est confirmée le 12/11/2024.")).toEqual([]);
  });
});

describe("dates d'ACTE — le verbe est la garde, pas la date", () => {
  /* Mesuré sur `bench/corpora/categoriesRares.json` : 11 dates sur 12 partaient en clair —
     bail, contrat de travail, Kbis, statuts, PV d'AG, acte de mariage, attestation d'emploi,
     convocation médicale — à côté de parties nommées, elles, redacted. C'est la PAIRE qui
     ré-identifie. Le détecteur de naissance ne pouvait pas les voir : il est gardé par le
     contexte de naissance, et aucune règle ne tire sur une date nue. */
  it.each([
    ["AUX TERMES D'UN ACTE reçu le 12/03/2024, la SCI a cédé", "12/03/2024"],
    ["Prise d'effet le 01/07/2025, loyer annuel 24 600.", "01/07/2025"],
    ["Immatriculée le 04/11/2019", "04/11/2019"],
    ["ont établi les statuts le 22/09/2023, à MONTPELLIER", "22/09/2023"],
    ["est embauchée à compter du 01/09/2021", "01/09/2021"],
    ["Réunie le 18/06/2026 au siège", "18/06/2026"],
    ["le mariage a été célébré le 27/05/2017 à PARIS", "27/05/2017"],
    ["votre consultation est fixée au 09/09/2026", "09/09/2026"],
    ["le compte rendu remis le 11/02/2026", "11/02/2026"],
  ])("redacted %s", (text, date) => {
    expect(values(text)).toContain(date);
  });

  it("suit le SECOND terme d'un intervalle ouvert par un verbe d'acte", () => {
    expect(values("a été employé du 03/01/2018 au 30/04/2024.")).toEqual(
      expect.arrayContaining(["03/01/2018", "30/04/2024"]),
    );
  });

  it("ne tire PAS sur une date sans verbe d'acte — c'est toute la garde", () => {
    // Un horodatage de journal, une date de facture, une période, une livraison : la
    // catégorie serait noyée et le document deviendrait illisible pour le modèle.
    expect(values("Facture du 12/03/2024 réglée")).toEqual([]);
    expect(values("12/03/2024 10:04:22 INFO démarrage")).toEqual([]);
    expect(values("Le rapport porte sur la période du 01/01/2026 au 31/12/2026.")).toEqual([]);
    expect(values("Livraison prévue le 15/04/2026")).toEqual([]);
    expect(values("exporté le 12/03/2024")).toEqual([]);
  });

  it("exige les SÉPARATEURS de la date — « signé le20juin2024 » reste de la prose collée", () => {
    // `model/pseudonymize/gluedProse.test.ts` épingle l'autre bout de cette frontière.
    expect(values("signé le20juin2024 puis du20juin2024a la remise")).toEqual([]);
  });
});

/* RÉSIDU ASSUMÉ, mesuré : l'intercalaire entre le verbe et l'article est plafonné à DEUX
   mots, donc « ont établi les statuts de la SCI LES TROIS TILLEULS le 22/09/2023 » n'est
   pas suivi. L'élargir (un intercalaire paresseux de 40 caractères, comme `BIRTH_RE`)
   attraperait « le contrat est daté et la réunion aura lieu le 15/04/2026 » — une date de
   réunion, pas un acte. Le rappel perdu est d'UNE vérité sur le banc ; le faux positif
   gagné serait sur toutes les dates de tous les documents. */

describe("dates d'acte — portée longue « à vérifier », clôture notariale, ordinal allemand", () => {
  const dets = (t: string) => detectBirthDates(t).map((d) => ({ v: d.value, u: d.uncertain ?? false }));

  it("le point ordinal allemand est une date de naissance comme une autre", () => {
    expect(dets("Frau STROBEL, geboren am 4. Juli 1968, wohnhaft")).toContainEqual({ v: "4. Juli 1968", u: false });
    expect(dets("Schülerin geboren am 27. Dezember 2009")).toContainEqual({ v: "27. Dezember 2009", u: false });
  });

  it("la longue portée atteint la date de constitution — MARQUÉE à vérifier", () => {
    expect(dets("ont établi les statuts de la SCI LES TROIS TILLEULS le 22/09/2023, à MONTPELLIER"))
      .toContainEqual({ v: "22/09/2023", u: true });
  });

  it("« Fait à VILLE, le … » est sans ambiguïté — détection franche", () => {
    expect(dets("Fait à Montpellier, le 22/09/2023")).toContainEqual({ v: "22/09/2023", u: false });
    expect(dets("Faits à Saint-Ouen-sur-Seine, le 3 janvier 2024")).toContainEqual({ v: "3 janvier 2024", u: false });
  });

  it("« fait » hors clôture et une simple réunion ne datent aucun acte", () => {
    expect(dets("il l'a fait le 12/05/2024 sans prévenir")).toEqual([]);
    expect(dets("la réunion prévue le 14/02/2025 est maintenue")).toEqual([]);
  });
});
