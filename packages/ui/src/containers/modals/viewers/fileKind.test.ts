import { describe, expect, it } from "vitest";
import { kindOf, fileSkelVariant } from "./fileKind";

/**
 * `kindOf` is the switch that decides whether a file's bytes are handed to an `<img>`,
 * so a format landing in the wrong bucket is a rendering decision, not a label.
 */
describe("kindOf — SVG n'est pas une image affichable", () => {
  // The two halves of the same regex disagreed: the extension list never held `svg`,
  // the mime half was a bare `^image/` and swallowed `image/svg+xml`. So the SAME file
  // was inert when named and renderable when it arrived with a mime (a drop, a tool
  // result — both reachable by someone else's content). SVG is a document format with
  // its own script and fetch surface; `ooxml/media.ts` and the favicon path already
  // refuse it, and this is the third door.
  it("classe image/svg+xml en « other », comme le nom .svg le faisait déjà", () => {
    expect(kindOf("image/svg+xml", "logo.svg")).toBe("other");
    expect(kindOf("image/svg+xml", "sans-extension")).toBe("other");
    expect(kindOf("", "logo.svg")).toBe("other");
  });

  it("laisse passer les vraies matricielles, par mime comme par extension", () => {
    for (const mime of [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/tiff",
    ]) {
      expect(kindOf(mime, "piece-jointe")).toBe("image");
    }
    for (const nom of [
      "scan.png",
      "photo.JPG",
      "photo.jpeg",
      "anim.gif",
      "v.webp",
      "b.bmp",
      "f.tif",
      "f.tiff",
    ]) {
      expect(kindOf("", nom)).toBe("image");
    }
  });

  it("ne reclasse rien d'autre au passage", () => {
    expect(kindOf("application/pdf", "contrat.pdf")).toBe("pdf");
    expect(kindOf("", "bilan.xlsx")).toBe("sheet");
    expect(kindOf("", "notes.md")).toBe("markdown");
    expect(kindOf("text/plain", "notes.txt")).toBe("text");
  });

  it("le squelette de chargement suit la même classification", () => {
    // Sinon un SVG afficherait la silhouette « image » d'un rendu qui n'aura pas lieu.
    expect(fileSkelVariant("image/svg+xml", "logo.svg")).toBe("doc");
    expect(fileSkelVariant("image/png", "scan.png")).toBe("image");
  });
});
