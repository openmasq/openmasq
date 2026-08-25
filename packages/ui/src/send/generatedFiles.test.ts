import { BRAND } from "@openmasq/branding";
import { describe, it, expect } from "vitest";
import { generatedFileNames, generatedFilesNote, pythonScriptNote, uniqueFileName } from "./generatedFiles";

describe("generatedFilesNote", () => {
  it("lists the deliverables + tells the model NOT to regenerate them", () => {
    const note = generatedFilesNote(["analyse_ia_souveraine.docx"]);
    expect(note).toContain("analyse_ia_souveraine.docx");
    expect(note).toMatch(/NE les régénère PAS/i);
    expect(note.startsWith("\n\n[")).toBe(true);
  });

  it("allows MODIFICATION (new version, same name) without naming run_python (it may be absent from the offer)", () => {
    const note = generatedFilesNote(["rapport.pdf"]);
    expect(note).toMatch(/MODIFIER/i);
    expect(note).toMatch(/MÊME nom/i);
    expect(note).not.toContain("run_python");
  });

  it("de-dupes and trims names, joins several", () => {
    expect(generatedFilesNote([" a.docx ", "a.docx", "b.pdf"])).toContain("a.docx, b.pdf");
  });

  it("is empty when there are no deliverables (no stray marker)", () => {
    expect(generatedFilesNote([])).toBe("");
    expect(generatedFilesNote(["", "   "])).toBe("");
  });
});

describe("pythonScriptNote", () => {
  it("carries the wire script in a python fence and steers to ITERATE, without naming run_python", () => {
    const note = pythonScriptNote(`df = ${BRAND.slug}_prices('SPY')\nprint(df)`);
    expect(note).toContain(`\`\`\`python\ndf = ${BRAND.slug}_prices('SPY')\nprint(df)\n\`\`\``);
    expect(note).toMatch(/repars de CE script/i);
    expect(note).toContain("analyse.py");
    expect(note).not.toContain("run_python"); // the tool may be absent from the offer
  });
  it("is empty for an empty script", () => {
    expect(pythonScriptNote("  \n ")).toBe("");
  });
});

describe("uniqueFileName", () => {
  it("garde le nom lisible tel quel quand il est libre", () => {
    expect(uniqueFileName("ventes-par-region.png", new Set())).toBe("ventes-par-region.png");
  });

  it("suffixe avant l'extension en cas de collision — le clic résout par NOM, dernier gagnant", () => {
    const taken = new Set(["ventes.png", "ventes-2.png"]);
    expect(uniqueFileName("ventes.png", taken)).toBe("ventes-3.png");
  });

  it("un nom sans extension se suffixe en queue", () => {
    expect(uniqueFileName("rapport", new Set(["rapport"]))).toBe("rapport-2");
  });
});

describe("generatedFileNames", () => {
  const msg = (role: string, atts?: { name: string; kind: string }[]) => ({ role, attachments: atts });

  it("collects the assistant's non-image attachments, in order", () => {
    expect(
      generatedFileNames([
        msg("user"),
        msg("assistant", [{ name: "a.pdf", kind: "file" }, { name: "fig.png", kind: "image" }]),
        msg("assistant", [{ name: "b.xlsx", kind: "file" }]),
      ]),
    ).toEqual(["a.pdf", "b.xlsx"]);
  });

  it("ignores the USER's attachments (their documents are not seeds)", () => {
    expect(generatedFileNames([msg("user", [{ name: "cv.pdf", kind: "file" }])])).toEqual([]);
  });

  it("de-dupes a re-generated name keeping the LAST occurrence, and caps to the most recent", () => {
    expect(
      generatedFileNames(
        [
          msg("assistant", [{ name: "a.pdf", kind: "file" }]),
          msg("assistant", [{ name: "b.pdf", kind: "file" }, { name: "a.pdf", kind: "file" }]),
        ],
        1,
      ),
    ).toEqual(["a.pdf"]);
  });
});
