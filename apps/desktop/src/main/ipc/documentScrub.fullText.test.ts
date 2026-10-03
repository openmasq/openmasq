import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { redactFileInPlace } from "@openmasq/redact/inplace";
import { makeDocumentScrub } from "./documentScrub";

/* The library's masked copy of a DOCX (`files:redact-and-save`). The rules (`redact`) find
   no NAME: a person the offline NER found exists only as a vault pair. The scrub must apply
   the vault it is given — the renderer hands it the send's pairs PLUS the document's
   whole-text drop-time map (`packages/ui/src/send/docScrubVault.test.ts` pins that half) —
   or every detected name, and anything past the wire cut, stays in clear in the copy. */

const NAME = "Ninon Verdolini";
const docx = (paras: string[]) =>
  zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      `<w:document><w:body>${paras.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`,
    ),
  });
const body = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)["word/document.xml"]);
const filler = Array.from({ length: 900 }, () => "Clause sans donnée personnelle, reprise pour le volume du document.");

describe("makeDocumentScrub applies the vault it is given, not only the rules", () => {
  it("a vaulted name past 50,000 characters is masked in the DOCX copy, with its category", () => {
    const paras = [...filler, `Signé par ${NAME}, ${NAME.toUpperCase()} en capitales.`];
    expect(paras.join("\n").indexOf(NAME)).toBeGreaterThan(50_000);
    const { scrub, spans, kinds } = makeDocumentScrub({ "Léa Morin": NAME }, undefined, { [NAME]: "name" });
    const out = body(redactFileInPlace("contrat.docx", docx(paras), "", scrub).bytes);
    expect(out).toContain("Signé par Léa Morin");
    expect(out.split(NAME).length - 1).toBe(0);
    expect(spans).toContainEqual({ value: NAME, kind: "name" });
    expect(kinds[NAME]).toBe("name");
  });

  it("without the pair the name stays in clear — what the copy was before", () => {
    const { scrub } = makeDocumentScrub({});
    expect(body(redactFileInPlace("c.docx", docx([`Signé par ${NAME}.`]), "", scrub).bytes)).toContain(NAME);
  });

  it("whole words only, and a category switched off is left as the rules leave it", () => {
    const { scrub } = makeDocumentScrub({ Ana: "Ana", "Léa Morin": NAME }, ["name"], { Ana: "name", [NAME]: "name" });
    expect(scrub(`Banana, ${NAME}`).text).toBe(`Banana, ${NAME}`);
    const failClosed = makeDocumentScrub({ Pat: "Ana" }, ["name"]); // unknown category ⇒ masked
    expect(failClosed.scrub("Ana et Banana").text).toBe("Pat et Banana");
  });
});
