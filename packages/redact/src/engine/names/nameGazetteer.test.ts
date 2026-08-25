import { describe, it, expect } from "vitest";
import { detectGazetteerNames } from "./nameGazetteer";

/* La sécurité du gazetteer EST la règle d'appariement : un prénom seul ne tire jamais,
   et chaque garde ci-dessous répond à un faux positif nommé. Toutes les personnes sont
   inventées. */
const vals = (t: string) => detectGazetteerNames(t).map((d) => d.value);

describe("gazetteer de prénoms — rappel", () => {
  it("attrape prénom + nom en prose, sans libellé ni civilité", () => {
    expect(vals("Le bail est signé par Julien Vidal et sa caution.")).toEqual(["Julien Vidal"]);
  });

  it("attrape l'ordre administratif NOM Prénom (majuscules)", () => {
    expect(vals("Propriétaire : VELINET Bernard, présent.")).toEqual(["VELINET Bernard"]);
  });

  it("attrape les prénoms composés et multiples", () => {
    expect(vals("Jean-Pierre Delrieux a signé.")).toEqual(["Jean-Pierre Delrieux"]);
    expect(vals("Julien Louis Corbel est né à Rennes.")).toEqual(["Julien Louis Corbel"]);
  });

  it("couvre plusieurs langues, accents perdus par l'OCR compris", () => {
    expect(vals("Contact : Aminata Bagayo et Zeynep Uslu.")).toEqual(["Aminata Bagayo", "Zeynep Uslu"]);
    expect(vals("Signature de Helene Vernaux.")).toEqual(["Helene Vernaux"]); // Hélène sans accent
  });

  it("couvre la longue traîne INSEE — prénoms rares, régionaux, d'origine étrangère", () => {
    // Chacun manquait au lexique curé et était un raté MESURÉ des bancs de rappel ;
    // la traîne vient de firstNames.insee.data.ts (≥100 naissances depuis 1900).
    expect(vals("Dossier suivi par Clémence Charvoz et Jonas Wendrick.")).toEqual([
      "Clémence Charvoz",
      "Jonas Wendrick",
    ]);
    expect(vals("Amaia Zubiaga-Verné a signé la promesse.")).toEqual(["Amaia Zubiaga-Verné"]);
    expect(vals("Rapport remis à Solweig Steger.")).toEqual(["Solweig Steger"]);
  });

  it("détache le génitif anglais — la valeur vaultée est le nom, pas « nom + 's »", () => {
    expect(vals("Paul-Émile Mvele's file is flagged.")).toEqual(["Paul-Émile Mvele"]);
  });
});

describe("gazetteer de prénoms — civilité collée par l'OCR", () => {
  it("décolle « MonsieurJulien VIDAL » et vaulte le NOM, pas la civilité", () => {
    expect(vals("Nom du locataire : MonsieurJulien VIDAL")).toEqual(["Julien VIDAL"]);
    expect(vals("LE BAILLEUR :MrPaul VERNAUX, présent")).toEqual(["Paul VERNAUX"]);
  });

  it("ne décolle pas un mot qui commence seulement comme une civilité", () => {
    // « Mireille » commence par « Mr »… non : la garde exige civilité + Majuscule.
    expect(vals("Mireille Fontaine a signé.")).toEqual(["Mireille Fontaine"]);
  });
});

describe("gazetteer de prénoms — les gardes, une par faux positif nommé", () => {
  it("un prénom SEUL ne tire jamais — c'est la règle centrale", () => {
    expect(vals("Pierre est venu hier. Claire aussi. Rose également.")).toEqual([]);
  });

  it("mot commun après le prénom : « Pierre tombe » n'est pas une personne", () => {
    expect(vals("La pierre tombe. Pierre tombe aussi.")).toEqual([]);
  });

  it("déterminant devant : « la Rose Blanche » est une enseigne, pas une personne", () => {
    expect(vals("Rendez-vous à la Rose Blanche à midi.")).toEqual([]);
  });

  it("mot de voirie devant : « rue Pierre Brossolette » appartient à l'adresse", () => {
    expect(vals("Domicilié 12 rue Pierre Brossolette.")).toEqual([]);
  });

  it("un mois n'est pas un nom de famille : « 15 Juin » ne fabrique rien", () => {
    expect(vals("Réunion le 15 Juin Prochain… euh, le lundi 15.")).toEqual([]);
  });

  it("un pays n'est pas un nom de famille : « Marie France » (revue) est épargné", () => {
    expect(vals("Abonnée à Marie France depuis 2019.")).toEqual([]);
  });

  it("un terme générique n'est pas un nom de famille", () => {
    expect(vals("Voir Florence Dossier au chapitre 3.")).toEqual([]);
  });
});

describe("particules — « de », « Le », « van »… entre prénom et nom", () => {
  it("attrape les paires à particule que le plancher de 3 capitales refusait", () => {
    expect(vals("Le rapport de Sanne de Vries est validé.")).toEqual(["Sanne de Vries"]);
    expect(vals("Facture réglée par Nolwenn Le Danvez hier.")).toEqual(["Nolwenn Le Danvez"]);
    expect(vals("Une fable de Jean de La Fontaine.")).toEqual(["Jean de La Fontaine"]);
    expect(vals("Le garant Karim el Rhandi signera demain.")).toEqual(["Karim el Rhandi"]);
  });

  it("une séquence rejetée ne peut plus AVALER le nom qu'elle contient", () => {
    // « Signature » ouvre la séquence à particule (« Signature de Helene… ») ; son
    // rejet doit reprendre l'analyse après le premier token, pas consommer le span.
    expect(vals("Signature de Helene Vernaux.")).toEqual(["Helene Vernaux"]);
  });

  it("« des » n'est pas une particule : les enseignes restent des enseignes", () => {
    expect(vals("Rendez-vous à la Rose des Vents à midi.")).toEqual([]);
  });

  it("une particule sans nom derrière ne fabrique rien", () => {
    expect(vals("Aude de la région lyonnaise nous écrit.")).toEqual([]);
  });
});

describe("« initiale + NOM » — détection marquée « à vérifier », jamais silencieuse", () => {
  const dets = (t: string) => detectGazetteerNames(t).map((d) => ({ value: d.value, uncertain: d.uncertain }));

  it("détecte T. SABOURDIN et J.-P. Vidal, TOUJOURS avec le flag uncertain", () => {
    expect(dets("Courrier signé T. SABOURDIN, gestionnaire.")).toEqual([
      { value: "T. SABOURDIN", uncertain: true },
    ]);
    expect(dets("Rapport relu par J.-P. Vidal avant envoi.")).toEqual([
      { value: "J.-P. Vidal", uncertain: true },
    ]);
  });

  it("les têtes de section et les acronymes ne deviennent jamais des personnes", () => {
    expect(vals("Voir annexe B. Introduction générale.")).toEqual([]);
    expect(vals("Chapitre C. Conclusion et perspectives.")).toEqual([]);
    expect(vals("Le TGV de la S.N.C.F. Paris-Lyon.")).toEqual([]);
  });
});
