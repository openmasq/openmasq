import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  DOC_BG,
  DOC_FONT_OFFICE,
  DOC_FONT_OFFICE_FALLBACK,
  DOC_FONT_PRINT,
  DOC_GRID,
  DOC_INK,
  DOC_LIME,
  DOC_MUTED,
  DOC_STRIPE,
} from "./documentTheme";

/**
 * The app generates deliverables through two typesetters: the HTML→PDF path (this package)
 * and the Python sandbox's `<slug>_pdf`/`<slug>_docx`/`<slug>_pptx` helpers, whose palette is a Python
 * source STRING in the desktop app — it cannot import a TS module. A user who receives one
 * document of each must not see two brands, so rule 9's answer to a necessary copy applies:
 * a parity test, not a "keep in sync" comment.
 */
// The palette lives in the SHARED module of the sandbox preamble — the one every branded
// format (PDF / DOCX / PPTX) draws from. Reading that file rather than a per-format one is
// what keeps this test true when a fourth format arrives.
const PREAMBLE = readFileSync(
  new URL("../../../../../apps/desktop/src/main/python/preamble/shared.ts", import.meta.url),
  "utf8",
);

/** `_KV_RGB_INK = (24, 35, 13)` → `#18230d`. */
function pythonHex(name: string): string {
  const m = new RegExp(`_KV_RGB_${name}\\s*=\\s*\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)`).exec(PREAMBLE);
  if (!m) throw new Error(`_KV_RGB_${name} introuvable dans preamble/shared.ts`);
  return (
    "#" +
    [m[1], m[2], m[3]]
      .map((c) => Number(c).toString(16).padStart(2, "0"))
      .join("")
  );
}

describe("document charter — one palette across both typesetters", () => {
  it("matches the Python document helpers colour for colour", () => {
    expect(DOC_INK).toBe(pythonHex("INK"));
    expect(DOC_MUTED).toBe(pythonHex("MUTED"));
    expect(DOC_LIME).toBe(pythonHex("LIME"));
    expect(DOC_BG).toBe(pythonHex("BG"));
    expect(DOC_GRID).toBe(pythonHex("GRID"));
    expect(DOC_STRIPE).toBe(pythonHex("STRIPE"));
  });
});

// The PDF face is embedded by the desktop's print window from a pinned file; its @font-face
// family is declared in the pin's own module, which this package cannot import.
const FONT_SPEC = readFileSync(
  new URL("../../../../../apps/desktop/src/main/pdf/documentFontSpec.ts", import.meta.url),
  "utf8",
);

function pythonStr(name: string): string {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]+)"`).exec(PREAMBLE);
  if (!m) throw new Error(`${name} introuvable dans preamble/shared.ts`);
  return m[1] as string;
}

describe("document typefaces — one choice across every typesetter", () => {
  it("the print CSS names the family the desktop embeds", () => {
    expect(/family:\s*"([^"]+)"/.exec(FONT_SPEC)?.[1]).toBe(DOC_FONT_PRINT);
  });

  it("the sandbox's Word/PowerPoint helpers use the same face and substitute as the DOCX export", () => {
    expect(pythonStr("_KV_OFFICE_FONT")).toBe(DOC_FONT_OFFICE);
    expect(pythonStr("_KV_OFFICE_FONT_ALT")).toBe(DOC_FONT_OFFICE_FALLBACK);
  });
});
