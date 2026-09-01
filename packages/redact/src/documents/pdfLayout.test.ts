import { describe, expect, it } from "vitest";
import { reconstructPageText, reconstructPdfText, reconstructLayout, type PdfTextItem } from "./pdfLayout";
import { detectLabeledFields } from "../engine/contextFields";

// Build a pdf.js-style text item at (x,y) with width w and height h (font size).
const item = (str: string, x: number, y: number, w = 20, h = 10): PdfTextItem => ({
  str,
  transform: [1, 0, 0, h, x, y],
  width: w,
  height: h,
});

describe("reconstructPageText", () => {
  it("joins items on the same line with a single space at a word gap", () => {
    // gap = 90-(50+30)=10 < 2*h(20) → one space
    expect(reconstructPageText([item("Nom :", 50, 700, 30), item("Rebour", 90, 700, 40)])).toBe(
      "Nom : Rebour",
    );
  });

  it("turns a wide horizontal gap into a column separator (double space)", () => {
    // gap = 250-(50+80)=120 ≥ 2*h → double space
    const out = reconstructPageText([
      item("Nom : Rebour", 50, 700, 80),
      item("Ville : Lyon", 250, 700, 70),
    ]);
    expect(out).toMatch(/^Nom : Rebour {2,}Ville : Lyon$/); // spaces proportional to the X gap
  });

  it("splits into lines by baseline-y and orders them top→bottom", () => {
    expect(reconstructPageText([item("Line1", 50, 700), item("Line2", 50, 680)])).toBe(
      "Line1\nLine2",
    );
  });

  it("recovers reading order from scrambled item order (y desc, then x asc)", () => {
    const scrambled = [
      item("Lyon", 90, 680, 40),
      item("Nom", 50, 700, 30),
      item("Rebour", 90, 700, 40),
      item("Ville", 50, 680, 30),
    ];
    expect(reconstructPageText(scrambled)).toBe("Nom Rebour\nVille Lyon");
  });

  it("joins tight kerning (a word split into items) with no space", () => {
    // gap = 60-(50+9)=1 < 0.15*h(1.5) → no space
    expect(reconstructPageText([item("Re", 50, 700, 9), item("bour", 60, 700, 20)])).toBe("Rebour");
  });

  it("keeps values verbatim and drops spacing-only items", () => {
    const out = reconstructPageText([
      item("IBAN :", 50, 700, 40),
      item("   ", 92, 700, 4),
      item("FR76 3000 6000", 100, 700, 90),
    ]);
    expect(out).toContain("FR76 3000 6000");
  });
});

describe("reconstructPdfText", () => {
  it("joins pages and skips empty ones", () => {
    const p1 = [item("Page one", 50, 700, 60)];
    const p2 = [item("Page two", 50, 700, 60)];
    expect(reconstructPdfText([p1, [], p2])).toBe("Page one\nPage two");
  });
});

describe("reconstructLayout — 2D grid placement", () => {
  it("places a top-right recipient address at the RIGHT, on the same lines as the left letterhead", () => {
    const items = [
      // left letterhead
      item("Expediteur SA", 50, 750, 60), item("12 rue Gauche", 50, 730, 60), item("75001 Paris", 50, 710, 60),
      // right recipient address, at a much larger X — same y-bands
      item("M. Rebour", 400, 750, 70), item("34 rue Droite", 400, 730, 80), item("35000 Rennes", 400, 710, 80),
    ];
    const { text } = reconstructLayout(items);
    const lines = text.split("\n");
    // left and right content share each line (true 2D layout), right block indented…
    expect(lines[0]).toMatch(/^Expediteur SA +M\. Rebour$/);
    expect(lines[1]).toMatch(/^12 rue Gauche +34 rue Droite$/);
    expect(lines[2]).toMatch(/^75001 Paris +35000 Rennes$/);
    // …and the right column is X-ALIGNED across the three lines (same start column).
    const c0 = lines[0].indexOf("M. Rebour");
    const c1 = lines[1].indexOf("34 rue Droite");
    const c2 = lines[2].indexOf("35000 Rennes");
    expect(c0).toBe(c1);
    expect(c1).toBe(c2);
    expect(c0).toBeGreaterThan("75001 Paris".length); // genuinely to the right
  });

  it("keeps a dense form (no big whitespace) as ONE band — no regression", () => {
    const { blocks, text } = reconstructLayout([
      item("Nom : Rebour", 50, 700, 80),
      item("Ville : Lyon", 250, 700, 70),
    ]);
    expect(blocks.length).toBe(1);
    expect(text).toMatch(/^Nom : Rebour {2,}Ville : Lyon$/);
  });

  it("emits a blank line at a big vertical gap (a new band)", () => {
    const { blocks, text } = reconstructLayout([
      item("Objet : contrat", 50, 700, 100),
      // far below → new band
      item("Madame, Monsieur,", 50, 500, 120),
    ]);
    expect(text).toContain("\n\n"); // blank line between the sections
    expect(blocks.length).toBe(2);
  });
});

// A 90°-CCW rotated item (a vertical margin banner): rotation lives in the transform
// ([0, h, -h, 0]); width stays the advance ALONG the reading direction (page +y).
const rotItem = (str: string, x: number, y: number, w = 20, h = 10): PdfTextItem => ({
  str,
  transform: [0, h, -h, 0, x, y],
  width: w,
  height: h,
});

describe("reconstructLayout — rotated text is quarantined, not interleaved", () => {
  it("emits a vertical margin banner AFTER the body, never inside its lines", () => {
    // SACEM-statement pathology (anonymised): a dense body table sharing its y-range with a
    // vertical banner running up the right margin. Treating the banner's (x,y) as
    // horizontal baselines interleaved its words into the table lines.
    const body = [
      item("TYPE DE DROIT", 50, 700, 90),
      item("Droit d'execution (DE)", 50, 680, 130),
      item("70,90", 250, 680, 30),
      item("Droit de reproduction (DR)", 50, 660, 150),
      item("5,10", 250, 660, 30),
    ];
    const banner = [rotItem("KELBY - RELEVE DE VOS DROITS", 580, 690, 170)];
    const { text } = reconstructLayout([...body, ...banner]);
    const [bodyPart, bannerPart] = text.split("\n\n");
    expect(bodyPart).not.toContain("KELBY");
    expect(bodyPart).toMatch(/Droit d'execution \(DE\) +70,90/);
    expect(bodyPart).toMatch(/Droit de reproduction \(DR\) +5,10/);
    expect(bannerPart).toBe("KELBY - RELEVE DE VOS DROITS");
  });

  it("reads a rotated stream in ITS reading order (bottom→top for 90° CCW)", () => {
    // Two fragments of one banner: the first-read word sits LOWER on the page.
    const { text } = reconstructLayout([
      rotItem("KELBY", 580, 600, 50),
      rotItem("RELEVE", 580, 660, 60),
    ]);
    expect(text).toBe("KELBY RELEVE");
  });

  it("keeps runs mapping to ORIGINAL item indices across streams", () => {
    const page = reconstructLayout([
      item("Corps", 50, 700, 40),
      rotItem("Marge", 580, 650, 40),
    ]);
    const marge = page.runs.find((r) => r.str === "Marge")!;
    expect(marge.itemIndex).toBe(1);
    expect(page.text.slice(marge.textStart, marge.textStart + 5)).toBe("Marge");
  });

  it("keeps a slightly skewed item (<45°) in the normal horizontal flow", () => {
    // ~10° skew: rotation is noise (a scanned-then-vectorised page), not a margin banner.
    const skewed: PdfTextItem = {
      str: "Rebour",
      transform: [9.8, 1.7, -1.7, 9.8, 90, 700],
      width: 40,
      height: 10,
    };
    expect(reconstructPageText([item("Nom :", 50, 700, 30), skewed])).toBe("Nom : Rebour");
  });

  it("maps a rotated stream's block box back to PAGE space", () => {
    const { blocks } = reconstructLayout([rotItem("Marge", 580, 600, 50)]);
    expect(blocks.length).toBe(1);
    const b = blocks[0].box;
    // The banner occupies x≈580, y from 600 upward (its width runs along page +y).
    expect(b.x0).toBeLessThanOrEqual(580);
    expect(b.x1).toBeGreaterThanOrEqual(580);
    expect(b.y0).toBeLessThanOrEqual(600);
    expect(b.y1).toBeGreaterThanOrEqual(650);
  });
});

describe("reconstructed PDF form → detectLabeledFields types it", () => {
  it("a two-column form row is split so each field is typed", () => {
    const text = reconstructPageText([
      item("nom : Rebour", 50, 700, 80),
      item("date de naissance : 12/04/1985", 260, 700, 150),
    ]);
    // reconstruction keeps them on one line, separated by the column gap…
    expect(text).toMatch(/^nom : Rebour {2,}date de naissance : 12\/04\/1985$/);
    // …so the labeled-field detector types each value from its label.
    const cats = Object.fromEntries(detectLabeledFields(text).map((d) => [d.category, d.value]));
    expect(cats.NAME).toBe("Rebour");
    expect(cats.DOB).toBe("12/04/1985");
  });
});
