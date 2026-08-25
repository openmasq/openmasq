import { describe, it, expect } from "vitest";
import { spatialFieldLines } from "./spatialFields";
import { redactExtracted } from "./reconcile";
import type { OcrLayerPage } from "./geometry";
import type { OcrWord } from "../ocr/layout";

/* L'appariement 2D libellé→valeur : la forme qu'un formulaire imprime et que le
   détecteur texte-plat REFUSE volontairement (la valeur à la ligne suivante). La
   géométrie — alignement gauche + adjacence verticale — est ce qui rend le refus
   levable sans redact de la prose. */

// Une ligne de mots : y = rang de ligne (hauteur 10), x0 de départ configurable.
const line = (text: string, row: number, x = 20): OcrWord[] => {
  let cx = x;
  return text.split(" ").map((t) => {
    const w: OcrWord = { text: t, x0: cx, y0: row * 22, x1: cx + t.length * 7, y1: row * 22 + 10 };
    cx += t.length * 7 + 5;
    return w;
  });
};
const page = (words: OcrWord[]): OcrLayerPage => ({
  text: "", words, width: 600, height: 800,
});
const fields = (words: OcrWord[]) => spatialFieldLines({ ocrPages: [page(words)] });

describe("spatialFieldLines — appariement par la géométrie", () => {
  it("apparie la valeur empilée SOUS son libellé (alignée à gauche)", () => {
    const words = [...line("Titulaire du contrat", 0), ...line("GAUDIER JEAN LOUIS", 1)];
    expect(fields(words)).toBe("Titulaire : GAUDIER JEAN LOUIS");
  });

  it("apparie un BLOC d'adresse multi-lignes (au plus 3)", () => {
    const words = [
      ...line("Adresse de facturation :", 0),
      ...line("Camille Valdonne", 1),
      ...line("8 Rue des Genêts", 2),
      ...line("35000 Rennes", 3),
      ...line("Merci de votre confiance", 8), // trop loin — jamais pris
    ];
    expect(fields(words)).toBe(
      "Adresse : Camille Valdonne\nAdresse : 8 Rue des Genêts\nAdresse : 35000 Rennes",
    );
  });

  it("ne prend RIEN quand la valeur est sur la même ligne (le texte plat sait déjà)", () => {
    expect(fields(line("Nom du propriétaire: Michel Vernaux", 0))).toBeNull();
  });

  it("ne prend RIEN quand la ligne du dessous est dans une AUTRE colonne", () => {
    const words = [...line("Adresse :", 0), ...line("227,80", 1, 400)];
    expect(fields(words)).toBeNull();
  });

  it("ne prend RIEN quand l'écart vertical dépasse l'adjacence d'un formulaire", () => {
    const words = [...line("Adresse :", 0), ...line("8 Rue des Genêts", 6)];
    expect(fields(words)).toBeNull();
  });

  it("s'arrête au libellé suivant — sa valeur lui appartient", () => {
    const words = [...line("Nom :", 0), ...line("Prénom :", 1), ...line("CLAIRE", 2)];
    expect(fields(words)).toBe("Prénom : CLAIRE");
  });

  it("une ligne à CHIFFRES n'est jamais un libellé (« Total 129,00 »)", () => {
    const words = [...line("Total 129,00", 0), ...line("dont TVA", 1)];
    expect(fields(words)).toBeNull();
  });
});

describe("redactExtracted — la 4e couche atteint le vault et le wire", () => {
  it("une valeur atteignable SEULEMENT par l'appariement spatial est vaultée et masquée", () => {
    // Un NIR dont le libellé est À LA LIGNE DU DESSUS : dans le texte plat, la règle
    // gated ne voit jamais « sécurité sociale » adjacent aux chiffres — la reconstruction
    // les a séparés. La ligne synthétisée « sécurité sociale : 184… » la fait tirer.
    // (redactExtracted passe par redact(), règles seules — le test reste dans ce que ce
    // moteur sait voir ; le chemin d'envoi, lui, passe par pseudonymize.)
    const words = [...line("N° de sécurité sociale :", 0), ...line("165031874259690", 1)];
    const file = {
      name: "doc.pdf",
      text: "Bulletin de paie.\nPage 1 —\n165031874259690\nSalaire de base…",
      ocrPages: [page(words)],
    } as Parameters<typeof redactExtracted>[0];
    const { wire, vault } = redactExtracted(file);
    expect(Object.values(vault)).toContain("165031874259690");
    expect(wire).not.toContain("165031874259690");
  });
});
