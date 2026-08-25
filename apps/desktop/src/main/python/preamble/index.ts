import { DOC_SHARED } from "./shared";
import { PDF_HELPERS } from "./pdf";
import { PPTX_HELPERS } from "./pptx";
import { DOCX_HELPERS } from "./docx";

/**
 * The brand-charter DOCUMENT helpers spliced into the sandbox preamble (`wheels.ts`
 * `buildScript`) — the deliverable-side twin of the matplotlib theme. They exist so EVERY
 * model, including a weak one, ships a polished PDF / DOCX / PPTX by calling a tiny API
 * instead of hand-rolling fpdf, python-docx or python-pptx layout.
 *
 * One module per format, one shared charter, because the gap this folder was split to fix
 * was a format simply being FORGOTTEN: PDF and PPTX each had an image path, Word had none.
 * A per-format module makes an absent format visible.
 */
export const DOC_HELPERS = [
  "# ── branded document helpers (PDF / DOCX / PPTX) ──",
  DOC_SHARED,
  PDF_HELPERS,
  DOCX_HELPERS,
  PPTX_HELPERS,
].join("\n");
