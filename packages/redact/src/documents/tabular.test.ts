import { describe, expect, it } from "vitest";
import { parseDelimited, gridToAnnotatedText, sniffDelimiter, annotatedCutRow, delimitedGrid } from "./tabular";
import { redact, unredact } from "../index";

describe("parseDelimited", () => {
  it("splits rows and cells", () => {
    expect(parseDelimited("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a quoted field with an embedded delimiter verbatim", () => {
    expect(parseDelimited('a,"b,c",d\n1,2,3')).toEqual([
      ["a", "b,c", "d"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a quoted field with an embedded newline", () => {
    expect(parseDelimited('x,"line1\nline2",z')).toEqual([["x", "line1\nline2", "z"]]);
  });

  it('unescapes "" → " inside a quoted field', () => {
    expect(parseDelimited('a,"he said ""hi"""')).toEqual([["a", 'he said "hi"']]);
  });

  it("handles a TSV delimiter", () => {
    expect(parseDelimited("a\tb\n1\t2", "\t")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not append a spurious empty row on a trailing newline (LF or CRLF)", () => {
    expect(parseDelimited("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(parseDelimited("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves a trailing empty cell", () => {
    expect(parseDelimited("a,b,\n1,2,3")).toEqual([
      ["a", "b", ""],
      ["1", "2", "3"],
    ]);
  });
});

describe("gridToAnnotatedText", () => {
  it("pairs each value with its column header", () => {
    const out = gridToAnnotatedText([
      ["nom", "num_secu", "ville"],
      ["Rebour", "172051873204152", "Lyon"],
    ]);
    expect(out).toBe("nom: Rebour | num_secu: 172051873204152 | ville: Lyon");
  });

  it("skips empty cells (no label: <blank> noise)", () => {
    const out = gridToAnnotatedText([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
    expect(out).toBe("a: 1 | c: 3");
  });

  it("labels a blank header as col{n}", () => {
    const out = gridToAnnotatedText([
      ["", "b"],
      ["1", "2"],
    ]);
    expect(out).toBe("col1: 1 | b: 2");
  });

  it("prefixes the sheet name when given", () => {
    expect(gridToAnnotatedText([["a"], ["1"]], "Feuille1")).toBe("=== Feuille1 ===\na: 1");
  });

  it("falls back to a flat join for a header-only / trivial grid", () => {
    expect(gridToAnnotatedText([["a", "b"]])).toBe("a b");
    expect(gridToAnnotatedText([])).toBe("");
  });

  it("keeps values VERBATIM (leading zeros, punctuation)", () => {
    const out = gridToAnnotatedText([
      ["id", "iban"],
      ["007", "FR76 3000 6000 0112 3456 7890 189"],
    ]);
    expect(out).toContain("id: 007");
    expect(out).toContain("iban: FR76 3000 6000 0112 3456 7890 189");
  });
});

describe("annotated tabular stays redactable + reversible", () => {
  it("detects a value in the annotated form and restores it", () => {
    const grid = parseDelimited("nom,email\nRebour,jean@example.fr");
    const text = gridToAnnotatedText(grid);
    expect(text).toBe("nom: Rebour | email: jean@example.fr");

    const vault: Record<string, string> = {};
    const { text: wire } = redact(text, { vault });
    // the email left the machine as a placeholder…
    expect(wire).not.toContain("jean@example.fr");
    // …and is restored verbatim from the vault (reversibility preserved).
    expect(unredact(wire, vault)).toContain("jean@example.fr");
  });
});

describe("sniffDelimiter — un CSV français ne perd pas ses centimes", () => {
  // Le grand livre tel qu'un logiciel de compta FR l'exporte : colonnes en `;`,
  // montants à virgule décimale. Lu à la virgule, `14 812,37` se coupait en deux et
  // la moitié orpheline tombait — le modèle recevait `14 812` et concluait à un
  // déséquilibre d'1 € sur une écriture qui tombe juste (parcours 15/08).
  const GRAND_LIVRE = [
    "Date;Journal;Compte;Libellé;Débit;Crédit",
    "02/02/2026;VE0201;411000;Facture F2026-0141;14 812,37;",
    "02/02/2026;VE0201;701000;Ventes marchandises;;12 343,64",
    "02/02/2026;VE0201;445710;TVA collectée 20 %;;2 468,73",
  ].join("\n");

  it("choisit le point-virgule, et les montants restent VERBATIM", () => {
    expect(sniffDelimiter(GRAND_LIVRE)).toBe(";");
    const texte = gridToAnnotatedText(parseDelimited(GRAND_LIVRE, sniffDelimiter(GRAND_LIVRE)));
    for (const montant of ["14 812,37", "12 343,64", "2 468,73"])
      expect(texte).toContain(montant);
    // Et la colonne est bien nommée : c'est ce qui donne son contexte au détecteur.
    expect(texte).toContain("Débit: 14 812,37");
  });

  it("laisse un CSV à virgules tel quel", () => {
    const anglais = "name,amount\nAcme,1000\nGlobex,2500";
    expect(sniffDelimiter(anglais)).toBe(",");
    expect(gridToAnnotatedText(parseDelimited(anglais, sniffDelimiter(anglais)))).toContain(
      "amount: 1000",
    );
  });

  it("ignore un séparateur cité et ne conclut pas sur un fichier d'une ligne", () => {
    // Les `;` ne vivent qu'à l'intérieur des guillemets : ils ne découpent rien.
    const cite = 'nom,note\n"Savary; Paul",ok\n"Morvan; Luc",ok';
    expect(sniffDelimiter(cite)).toBe(",");
    expect(sniffDelimiter("juste;une;ligne")).toBe(",");
  });
});

describe("aucune cellule ne disparaît sous un en-tête plus étroit", () => {
  // Un export comptable réel commence par une ligne de TITRE d'une seule cellule.
  // Bornée à sa largeur, l'annotation ne gardait que la 1re colonne de chaque
  // écriture : montants, comptes et libellés partaient à la poubelle en silence.
  const AVEC_TITRE = [
    "Grand livre — TARVELONE MATÉRIAUX SARL",
    "Date;Compte;Libellé;Débit",
    "02/02/2026;411000;Facture F2026-0141;14 812,37",
  ].join("\n");

  it("garde toutes les colonnes, et les nomme par leur VRAI en-tête", () => {
    const texte = gridToAnnotatedText(parseDelimited(AVEC_TITRE, ";"));
    expect(texte).toContain("Débit: 14 812,37");
    expect(texte).toContain("Compte: 411000");
    expect(texte).toContain("Libellé: Facture F2026-0141");
    // Le préambule (le titre) est ré-émis, jamais jeté.
    expect(texte).toContain("Grand livre — TARVELONE MATÉRIAUX SARL");
  });

  it("bout en bout : un grand livre FR garde ses montants au centime", () => {
    const texte = gridToAnnotatedText(parseDelimited(AVEC_TITRE, sniffDelimiter(AVEC_TITRE)));
    expect(texte).toContain("14 812,37");
  });
});

describe("en-tête : un TITRE fusionné n'en est pas un (bilan réel, 15/08/2026)", () => {
  /** La forme d'un export comptable : titre en cellule FUSIONNÉE (ligne pleine largeur,
   *  une seule cellule remplie), métadonnées, puis la vraie ligne d'en-tête. */
  const GRILLE = [
    ["PRÉVISIONNEL KARL STUDIO", "", "", "", ""],
    ["SIRET : 84631257904319", "", "", "", ""],
    ["Montants exprimés en euros", "", "", "", ""],
    ["BILAN ACTIF", "", "", "", ""],
    ["Postes", "Brut", "Amortissements", "Net 2023", "Net 2022"],
    ["Capital souscrit non appelé", "0", "0", "0", "0"],
    ["Immobilisations corporelles", "14812.37", "1240.08", "13572.29", "0"],
  ];

  it("annote avec les VRAIES colonnes, pas avec le titre", () => {
    const out = gridToAnnotatedText(GRILLE);
    // Le typage par colonne — la raison d'être de cette annotation — est rendu au détecteur
    // ET au modèle : sans lui, « 1240.08 » arrivait sous le nom « col3 ».
    expect(out).toContain("Brut: 14812.37");
    expect(out).toContain("Amortissements: 1240.08");
    expect(out).not.toContain("col2:");
    // …et la raison sociale ne préfixe plus CHAQUE ligne (des centaines de répétitions).
    expect(out).not.toMatch(/PRÉVISIONNEL KARL STUDIO: Capital/);
  });

  it("le préambule est ré-émis tel quel, jamais jeté", () => {
    const out = gridToAnnotatedText(GRILLE);
    for (const l of ["PRÉVISIONNEL KARL STUDIO", "SIRET : 84631257904319", "BILAN ACTIF"]) {
      expect(out).toContain(l);
    }
  });

  it("repli : une grille à UNE colonne garde l'ancienne règle", () => {
    const out = gridToAnnotatedText([["Libellé"], ["Loyer"], ["Assurance"]]);
    expect(out).toContain("Loyer");
    expect(out).toContain("Assurance");
  });
});

describe("annotatedCutRow — la coupe d'envoi mappée sur les LIGNES de la grille", () => {
  const grid = (n: number): string[][] => {
    const rows: string[][] = [["nom", "email"]];
    for (let i = 0; i < n; i++) rows.push([`Personne ${i}`, `personne${i}@exemple.fr`]);
    return rows;
  };

  it("null quand tout tient dans la borne", () => {
    expect(annotatedCutRow(grid(5), 10_000)).toBe(null);
    expect(annotatedCutRow([], 10)).toBe(null);
  });

  it("parité avec la sérialisation : les lignes AVANT la coupe tiennent, la suivante déborde", () => {
    const rows = grid(50);
    const full = gridToAnnotatedText(rows);
    const max = Math.floor(full.length / 3);
    const cut = annotatedCutRow(rows, max)!;
    expect(cut).toBeGreaterThan(1); // l'en-tête + au moins une ligne passent
    // Sérialiser UNIQUEMENT les lignes envoyées (en-tête + données < cut) tient dans max…
    expect(gridToAnnotatedText(rows.slice(0, cut)).length).toBeLessThanOrEqual(max);
    // …et ajouter la ligne de coupe déborde.
    expect(gridToAnnotatedText(rows.slice(0, cut + 1)).length).toBeGreaterThan(max);
  });

  it("la coupe est EXACTEMENT la frontière du clip par ligne (aucune valeur tranchée)", () => {
    const rows = grid(50);
    const full = gridToAnnotatedText(rows);
    const max = Math.floor(full.length / 2);
    // Le clip d'envoi : coupe à la dernière fin de ligne dans la borne.
    const nl = full.lastIndexOf("\n", max);
    const clipped = full.slice(0, nl);
    const cut = annotatedCutRow(rows, max)!;
    // Chaque ligne envoyée est présente ENTIÈRE dans le texte clippé ; la première
    // ligne coupée n'y est pas du tout.
    const lastSent = `nom: Personne ${cut - 2} | email: personne${cut - 2}@exemple.fr`;
    const firstCutLine = `nom: Personne ${cut - 1} | email: personne${cut - 1}@exemple.fr`;
    expect(clipped).toContain(lastSent);
    expect(clipped).not.toContain(`Personne ${cut - 1}`);
    expect(full).toContain(firstCutLine); // la ligne existe bien — elle est juste coupée
  });

  it("préambule + nom de feuille comptent dans la borne", () => {
    const rows: string[][] = [["Grand livre — export", "", ""], ["compte", "libellé", "montant"]];
    for (let i = 0; i < 20; i++) rows.push([`40${i}`, `Fournisseur ${i}`, `${i}00`]);
    const full = gridToAnnotatedText(rows, "Feuil1");
    const cut = annotatedCutRow(rows, Math.floor(full.length / 2), "Feuil1")!;
    expect(cut).toBeGreaterThan(2);
    expect(gridToAnnotatedText(rows.slice(0, cut), "Feuil1").length).toBeLessThanOrEqual(
      Math.floor(full.length / 2),
    );
  });
});

describe("delimitedGrid — le parse d'extraction, une seule maison", () => {
  it("TSV = tabulations ; sinon le séparateur se devine (`;` comptable)", () => {
    expect(delimitedGrid("a\tb\n1\t2", true)).toEqual([["a", "b"], ["1", "2"]]);
    const fr = "compte;libellé;montant\n401;ACME;14 812,37\n402;OVH;3,50\n403;EDF;9,99";
    expect(delimitedGrid(fr, false)[1]).toEqual(["401", "ACME", "14 812,37"]);
  });
});
