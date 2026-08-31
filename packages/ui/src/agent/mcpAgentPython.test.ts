import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GUIDANCE = readFileSync(join(__dirname, "mcpAgentPython.ts"), "utf8");

/**
 * The steering text that tells the model how to produce a DELIVERABLE.
 *
 * WHY THIS TEST EXISTS. Word was offered as an output format, and quietly had no image
 * path: PDF got `doc.image(...)`, PPTX got `*_slide(image=...)`, Word got neither a
 * helper nor a sentence. Asked to add an illustration to a .docx, the model answered that
 * it had added « une section pour l'illustration » — a heading. It did not lie and it did
 * not error; it did the only thing the guidance left it.
 *
 * That is the failure shape to guard: a format half-supported reads to the model as
 * supported. So the rule is per-format and mechanical — **if the guidance offers a document
 * format, it must also say how to put a picture in it.**
 */
// The guidance builds the names at runtime (`PY = BRAND.slug`), so the SOURCE carries
// the derived form `" + PY + "_pdf(` — that's what we pin, never a brand literal.
const FORMATS = [
  { label: "PDF", helper: /PY \+ "_pdf\(/, image: /doc\.image\(/ },
  { label: "Word", helper: /PY \+ "_docx\(/, image: /doc\.image\(/ },
  { label: "PowerPoint", helper: /PY \+ "_pptx\(/, image: /PY \+ "_slide\([^`]*image=/ },
];

describe("consigne run_python — chaque format de document offert sait recevoir une image", () => {
  it.each(FORMATS)("$label : le helper est nommé", ({ helper }) => {
    expect(GUIDANCE).toMatch(helper);
  });

  it.each(FORMATS)("$label : le chemin d'insertion d'image est documenté", ({ image }) => {
    expect(GUIDANCE).toMatch(image);
  });

  it("la figure à insérer est toujours produite par plt.savefig", () => {
    // Without this the model invents a path that does not exist in the sandbox.
    expect(GUIDANCE).toMatch(/plt\.savefig\(/);
  });

  it("annoncer une illustration au lieu de l'insérer est explicitement interdit", () => {
    // The exact behaviour observed in the field — a heading standing in for the picture.
    expect(GUIDANCE).toMatch(/n'annonce JAMAIS une illustration par un simple titre/);
  });

  it("les accents français sont explicitement autorisés dans les documents générés", () => {
    // Measured (15/08/2026): without this sentence, the model "plays it safe" on its PDF by
    // stripping all diacritics — "Societe par actions simplifiee", "Nationalite : Francaise" —
    // in a document meant for a bank. Nothing along the way strips them: the helpers
    // embed a full font. So it's up to the guidance to say so.
    expect(GUIDANCE).toMatch(/N'ôte JAMAIS les diacritiques/);
    expect(GUIDANCE).toMatch(/accents et ponctuation/);
  });

  it("le rechargement d'un fichier déjà généré nomme les TROIS formats", () => {
    // « modifie ce document » only works because the prior deliverable is seeded back into
    // the run CWD. A format missing from this list gets recreated from scratch instead.
    for (const loader of ["load_workbook", "Presentation(", "docx.Document("]) {
      expect(GUIDANCE).toContain(loader);
    }
  });
});
