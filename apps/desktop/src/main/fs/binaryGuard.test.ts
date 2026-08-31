import { describe, it, expect } from "vitest";
import { readVerdict } from "./binaryGuard";

const TEXT = new TextEncoder().encode("Bonjour, ceci est du texte.");
const BINARY = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x01, 0x02]);

/**
 * The failure this guards, observed in the field: « fais un résumé de tous les documents »
 * → the model called `read_file` on a PDF → 16 000 characters of mojibake, 4.5 s of local
 * NER spent redact garbage, 52 000 characters of noise in the prompt. Nothing
 * errored; the answer was simply impossible and the user paid the latency and the tokens.
 *
 * A refusal that NAMES the working tool is worth more than any amount of bytes.
 */
describe("read_file — un document n'est pas du texte brut", () => {
  it("refuse un PDF et nomme `read_document`", () => {
    const v = readVerdict("/a/facture.pdf", TEXT);
    expect(v.kind).toBe("document");
    expect(v.kind !== "text" && v.message).toContain("read_document");
  });

  it("refuse les formats bureautiques, quelle que soit la casse", () => {
    for (const n of ["/a/x.docx", "/a/x.XLSX", "/a/x.pptx", "/a/x.odt", "/a/Rapport.PDF"]) {
      expect(readVerdict(n, TEXT).kind, n).toBe("document");
    }
  });

  it("refuse une image ou une archive, sans promettre une extraction impossible", () => {
    // There's nothing to extract: the message must NOT point to `read_document`.
    const v = readVerdict("/a/photo.png", TEXT);
    expect(v.kind).toBe("opaque");
    expect(v.kind !== "text" && v.message).not.toContain("read_document");
    expect(readVerdict("/a/archive.zip", TEXT).kind).toBe("opaque");
  });

  it("laisse passer le texte, y compris les extensions de code", () => {
    for (const n of ["/a/notes.txt", "/a/README.md", "/a/data.csv", "/a/app.ts", "/a/.env"]) {
      expect(readVerdict(n, TEXT).kind, n).toBe("text");
    }
  });

  it("se rabat sur les OCTETS quand l'extension ne dit rien", () => {
    // A NUL never appears in UTF-8: it's proof, not a heuristic.
    expect(readVerdict("/a/mystere", BINARY).kind).toBe("opaque");
    expect(readVerdict("/a/mystere", TEXT).kind).toBe("text");
  });
});
