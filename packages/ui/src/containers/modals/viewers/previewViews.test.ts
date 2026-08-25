import { describe, expect, it } from "vitest";
import {
  previewShape,
  initialView,
  previewViews,
  redactedGridReady,
  type PreviewFile,
} from "./previewViews";

const file = (over: Partial<PreviewFile>): PreviewFile => ({
  name: "compte_resultat.xls",
  text: "ligne 1\nligne 2",
  kind: "",
  ...over,
});

const ids = (f: PreviewFile) => previewViews(previewShape(f), f).map((v) => v.id);
const opens = (f: PreviewFile) => initialView(previewShape(f), f);

describe("un CSV s'ouvre sur ce qui PART, pas sur ce qu'on a déposé", () => {
  const csv = (over: Partial<PreviewFile> = {}) =>
    file({ name: "grand-livre.csv", data: "QUJD", ...over });

  it("la grille REDACTED est la vue d'ouverture", () => {
    // Cette modale sert à vérifier ce qui quitte la machine. Ouverte sur les vraies
    // valeurs, elle donnait la lecture inverse : on relit son fichier, on le reconnaît,
    // on envoie — le redaction restait un cran plus loin dans le menu.
    expect(opens(csv())).toBe("redacted");
  });

  it("« Feuille » reste offerte, annoncée pour ce qu'elle est", () => {
    const v = previewViews(previewShape(csv()), csv());
    expect(v.map((x) => x.id)).toContain("rich");
    expect(v.find((x) => x.id === "rich")?.hint).toMatch(/avant redaction/);
  });

  it("sans texte extrait, on n'ouvre pas une vue que le menu n'offre pas", () => {
    const f = csv({ text: "" });
    expect(ids(f)).not.toContain("redacted");
    expect(opens(f)).toBe("rich");
  });

  it("la règle vaut pour TOUS les formats, pas seulement le CSV", () => {
    // Un .xlsx, un .docx, un .txt : tous ouvraient sur le document tel quel.
    expect(opens(file({ name: "compte.xlsx", data: "QUJD" }))).toBe("redacted");
    expect(opens(file({ name: "contrat.docx", data: "QUJD" }))).toBe("redacted");
    expect(opens(file({ name: "notes.txt" }))).toBe("redacted");
    expect(opens(file({ name: "notes.md", text: "# titre" }))).toBe("redacted");
  });

  it("mais PAS pour le PDF ni l'image : leur vue d'ouverture EST déjà redacted", () => {
    // Les fausses valeurs y sont peintes sur les pages / les pixels : les envoyer sur la
    // couche texte ferait perdre le document au lieu de montrer ce qui part.
    expect(opens(file({ name: "a.pdf", data: "QUJD" }))).toBe("pdf");
    expect(opens(file({ name: "a.png", data: "QUJD" }))).toBe("image");
  });
});

describe("previewViews — la vue TABLEUR est offerte, quelle que soit la route des octets", () => {
  it("bytes en mémoire (glisser-déposer, ré-attache) : la Feuille est OFFERTE", () => {
    // LE bug que ceci garde : la vue riche était conditionnée à `file.path`, qu'un fichier
    // déposé n'a pas — il voyage en `data`. Le tableur retombait sur le texte extrait,
    // « en row ». Elle n'est plus la vue d'OUVERTURE (on ouvre sur ce qui part), mais elle
    // doit rester atteignable : c'est là qu'on relit ce que le redaction a touché.
    const f = file({ data: "QUJD" });
    expect(ids(f)).toContain("rich");
    expect(previewViews(previewShape(f), f).find((v) => v.id === "rich")?.label).toBe("Feuille");
  });

  it("chemin natif : la Feuille est offerte aussi", () => {
    expect(ids(file({ path: "/tmp/compte_resultat.xls" }))).toContain("rich");
  });

  it("sans octets du tout, on ne promet pas une vue qu'on ne peut pas rendre", () => {
    const f = file({});
    expect(ids(f)).not.toContain("rich");
    expect(opens(f)).toBe("redacted");
  });

  it("les trois familles de tableur, par extension comme par `kind`", () => {
    for (const name of ["a.xls", "a.xlsx", "a.xlsm", "a.ods", "a.csv", "a.tsv"]) {
      expect(previewShape(file({ name })).isSheet).toBe(true);
    }
    expect(previewShape(file({ name: "sans-extension", kind: "csv" })).isSheet).toBe(true);
    expect(previewShape(file({ name: "sans-extension", kind: "xlsx" })).isSheet).toBe(true);
  });
});

describe("previewViews — les vues offertes par format", () => {
  it("chaque format déposé offre bien sa vue riche, sans être celle qui s'ouvre", () => {
    expect(ids(file({ name: "a.docx", data: "QUJD" }))).toContain("rich");
    expect(ids(file({ name: "a.pptx", data: "QUJD" }))).toContain("rich");
    expect(ids(file({ name: "a.pdf", data: "QUJD" }))).toContain("pdf");
    expect(ids(file({ name: "a.png", data: "QUJD" }))).toContain("image");
  });

  it("nomme la vue riche selon le format", () => {
    const pptx = file({ name: "a.pptx", data: "QUJD" });
    expect(previewViews(previewShape(pptx), pptx).find((v) => v.id === "rich")?.label).toBe(
      "Présentation",
    );
    const docx = file({ name: "a.docx", data: "QUJD" });
    expect(previewViews(previewShape(docx), docx).find((v) => v.id === "rich")?.label).toBe(
      "Document",
    );
  });
});

describe("previewViews — les couches de texte", () => {
  it("un format riche n'offre PAS « Original » (sa vue document n'est pas redacted)", () => {
    expect(ids(file({ data: "QUJD" }))).toEqual(["rich", "redacted"]);
  });

  it("les deux couches d'un tableur sont nommées pour ce qu'elles sont", () => {
    // « Feuille » a pris le rôle d'« Original » — le fichier tel quel — parce que la
    // couche redacted est une grille elle aussi, plus un mur de lignes.
    const f = file({ data: "QUJD" });
    const [rich, cav] = previewViews(previewShape(f), f);
    expect(rich.hint).toBe("Le fichier tel quel, avant redaction");
    // Et le redacted ne se dit plus « texte » : pour un tableur, c'en est un tableau.
    expect(cav.hint).toBe("Ce qui quittera la machine");
    expect(cav.shield).toBe(true);
  });

  it("un csv est signalé au parseur — `.xls*` est un binaire, pas du délimité", () => {
    expect(previewShape(file({ name: "a.csv" })).isCsv).toBe(true);
    expect(previewShape(file({ name: "a.tsv" })).isCsv).toBe(true);
    expect(previewShape(file({ name: "a.xls" })).isCsv).toBe(false);
    expect(previewShape(file({ name: "a.xlsx" })).isCsv).toBe(false);
  });

  it("un texte simple offre Original puis Redacted", () => {
    expect(ids(file({ name: "notes.txt" }))).toEqual(["original", "redacted"]);
  });

  it("la couche OCR n'apparaît que lorsqu'elle DIT autre chose", () => {
    const same = file({ name: "scan.pdf", data: "QUJD", ocrText: "ligne 1\nligne 2" });
    expect(ids(same)).not.toContain("ocr");
    const other = file({ name: "scan.pdf", data: "QUJD", ocrText: "un texte caché" });
    expect(ids(other)).toContain("ocr");
  });

  it("un fichier sans texte extrait n'offre aucune couche texte", () => {
    expect(ids(file({ name: "a.png", data: "QUJD", text: "" }))).toEqual(["image"]);
  });
});

describe("redactedGridReady — la grille ne ment pas sur ce qu'elle montre", () => {
  it("sans remplacements, pas de grille : la couche texte sait attendre", () => {
    // ⛔ Le piège que cette ouverture par défaut rendait courant : `renderFake` sans rien à
    // substituer affiche les VRAIES valeurs sous l'étiquette « Redacted ».
    expect(redactedGridReady(true, false)).toBe(false);
  });

  it("une liste VIDE est une réponse, pas une absence", () => {
    // La passe a tourné et n'a rien trouvé : le fichier EST sa version redacted.
    expect(redactedGridReady(true, true)).toBe(true);
  });

  it("hors tableur, jamais de grille", () => {
    expect(redactedGridReady(false, true)).toBe(false);
  });
});
