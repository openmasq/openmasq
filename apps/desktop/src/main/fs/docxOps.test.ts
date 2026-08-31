import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { makeGrant } from "./grant";
import { DOCX_OPS } from "./docxOps";

/**
 * The property the whole surgical approach rests on, verified on a REAL package rather than
 * on an XML string: **every part we did not edit comes back byte for byte**. That is what
 * makes "the styles survived" a fact rather than a hope — nothing preserved them, we simply
 * never rewrote them.
 */
const STYLES = '<?xml version="1.0"?><w:styles><w:style w:styleId="Titre"/></w:styles>';
const IMAGE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]); // a "PNG"
const BODY =
  '<?xml version="1.0"?><w:document><w:body>' +
  '<w:p><w:r><w:t xml:space="preserve">Montant : </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>1500</w:t></w:r></w:p>' +
  "<w:p><w:r><w:t>Signature</w:t></w:r></w:p>" +
  "</w:body></w:document>";

let dir: string;
let file: string;
let grant: ReturnType<typeof makeGrant>;

function makeDocx(): void {
  const zip = zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types/>'),
    "word/document.xml": strToU8(BODY),
    "word/styles.xml": strToU8(STYLES),
    "word/media/image1.png": IMAGE,
  });
  writeFileSync(file, zip);
}

const write = async (p: string, bytes: Uint8Array): Promise<void> => {
  writeFileSync(p, bytes);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openmasq-docx-"));
  file = join(dir, "rapport.docx");
  grant = makeGrant([dir], []);
  makeDocx();
});

describe("read_document", () => {
  it("recolle les runs et annonce le nombre de paragraphes", async () => {
    const out = await DOCX_OPS.read_document(grant, { path: file }, write);
    expect(out).toContain("Montant : 1500");
    expect(out).toContain("Signature");
    expect(out).toContain("2 paragraphe(s)");
  });

  it("refuse un fichier qui n'est pas un Word", async () => {
    const bogus = join(dir, "faux.docx");
    writeFileSync(bogus, zipSync({ "hello.txt": strToU8("hi") }));
    await expect(DOCX_OPS.read_document(grant, { path: bogus }, write)).rejects.toThrow(
      /document Word/,
    );
  });

  it("refuse un chemin hors des dossiers autorisés", async () => {
    await expect(DOCX_OPS.read_document(grant, { path: "/etc/hosts" }, write)).rejects.toThrow(
      /refusé/,
    );
  });
});

describe("edit_document — le reste du paquet est intact", () => {
  it("réécrit le passage et laisse styles et images OCTET pour OCTET", async () => {
    const before = unzipSync(readFileSync(file));
    const msg = await DOCX_OPS.edit_document(
      grant,
      { path: file, oldText: "Montant : 1500", newText: "Montant : 1800" },
      write,
    );
    expect(msg).toContain("paragraphe 1");

    const after = unzipSync(readFileSync(file));
    // THE assertion: only the body changed.
    expect(strFromU8(after["word/styles.xml"])).toBe(STYLES);
    expect([...after["word/media/image1.png"]]).toEqual([...before["word/media/image1.png"]]);
    expect(strFromU8(after["[Content_Types].xml"])).toBe(strFromU8(before["[Content_Types].xml"]));

    const body = strFromU8(after["word/document.xml"]);
    expect(body).toContain("Montant : 1800");
    // The second paragraph hasn't moved.
    expect(body).toContain("<w:t>Signature</w:t>");
  });

  it("REFUSE plutôt que de deviner quand le texte est absent", async () => {
    const before = readFileSync(file);
    await expect(
      DOCX_OPS.edit_document(grant, { path: file, oldText: "absent", newText: "x" }, write),
    ).rejects.toThrow(/introuvable/);
    // A refusal doesn't touch the file.
    expect([...readFileSync(file)]).toEqual([...before]);
  });
});
