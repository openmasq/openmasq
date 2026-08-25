import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { DOC_BG, DOC_GRID, DOC_INK, DOC_LIME, DOC_MUTED, DOC_STRIPE } from "./documentTheme";

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
