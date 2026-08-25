import { describe, it, expect } from "vitest";
import { documentTitle, documentFilename } from "./documentExport";

describe("documentTitle", () => {
  it("uses the first Markdown heading", () => {
    expect(documentTitle("# Rapport Q3\n\nCorps du document…")).toBe("Rapport Q3");
    expect(documentTitle("## Lettre de motivation\ntexte")).toBe("Lettre de motivation");
  });

  it("skips blank/rule lines and strips markdown marks", () => {
    expect(documentTitle("\n\n---\n\n**Contrat de prestation**\n…")).toBe("Contrat de prestation");
  });

  it("falls back to the first non-empty line when there is no heading", () => {
    expect(documentTitle("Cher Marcus,\n\nJe vous écris…")).toBe("Cher Marcus,");
  });

  it("caps a very long title with an ellipsis", () => {
    const long = "# " + "mot ".repeat(40);
    const t = documentTitle(long);
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t.endsWith("…")).toBe(true);
  });

  it("defaults to 'Document' for empty / markup-only input", () => {
    expect(documentTitle("")).toBe("Document");
    expect(documentTitle("\n   \n")).toBe("Document");
    expect(documentTitle("###")).toBe("Document");
  });
});

describe("documentFilename", () => {
  it("slugifies the title with the extension", () => {
    expect(documentFilename("Rapport Q3", "md")).toBe("rapport-q3.md");
  });

  it("strips accents and punctuation", () => {
    expect(documentFilename("Lettre de résiliation — Août", "txt")).toBe("lettre-de-resiliation-aout.txt");
  });

  it("defaults the slug when the title has no usable chars", () => {
    expect(documentFilename("——", "md")).toBe("document.md");
  });
});
