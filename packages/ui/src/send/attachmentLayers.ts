// The attachments' EXTRA DETECTION LAYERS — what the pixels say (`ocrText`) and the
// HYBRID reading (exact text-layer characters re-serialized in the OCR reading order,
// built from the per-page geometry when the two readings diverge).
//
// DETECTION-ONLY: this block is fed to the redaction engine so its values land in the
// conversation vault BEFORE the message pass — (a) PII visible only in the page image is
// vaulted, and (b) a value the primary text HOLDS but hides from its detector (broken
// reading order put the label lines away) is then replaced in the wire by the vault
// replay of the message pass. The block itself is NEVER sent to a model.
import { hybridLayerText, spatialFieldLines } from "@openmasq/redact/documents.browser";
import type { ExtractedFile } from "../host/files";
import { clipFileText } from "./foldPayload";

/** Mirror of the fold's per-document clip — an enormous OCR layer must not blow the
 *  engine call; the primary text is clipped at the same bound by `buildFoldedPayload`. */
const MAX_LAYER_CHARS = 50_000;

type LayeredAttachment = Pick<
  ExtractedFile,
  "name" | "text" | "ocrText" | "textPages" | "ocrPages"
>;

/** One attachment's extra layers: the OCR text when it differs from the primary, and
 *  the hybrid reading when the geometry warrants one (and it differs from both). */
export function attachmentExtraLayers(a: LayeredAttachment): string[] {
  const primary = (a.text ?? "").trim();
  const out: string[] = [];
  const ocr = (a.ocrText ?? "").trim();
  if (ocr && ocr !== primary) out.push(ocr);
  const hybrid = (hybridLayerText({ textPages: a.textPages, ocrPages: a.ocrPages }) ?? "").trim();
  if (hybrid && hybrid !== primary && hybrid !== ocr) out.push(hybrid);
  // Spatial label→value pairing (a form's value stacked under its label) — synthesized
  // `label : value` lines the flat layers cannot produce; same fail-closed contract.
  const fields = (spatialFieldLines({ textPages: a.textPages, ocrPages: a.ocrPages }) ?? "").trim();
  if (fields) out.push(fields);
  return out;
}

/**
 * The single detection block for a send's attachments, or "" when no attachment has an
 * extra layer (the common text-only case — the send pays nothing). Headers carry no real
 * filename (it can itself leak — same rule as the fold's `safeName`).
 */
export function attachmentDetectBlock(attachments: LayeredAttachment[] | undefined): string {
  const parts: string[] = [];
  (attachments ?? []).forEach((a, i) => {
    for (const layer of attachmentExtraLayers(a)) {
      // Line-boundary clip (`clipFileText`): a mid-value slice would vault a FRAGMENT,
      // whose forward substitution then chews the full value's occurrences elsewhere.
      const clipped =
        layer.length > MAX_LAYER_CHARS ? clipFileText(layer, MAX_LAYER_CHARS) + "\n…(truncated)" : layer;
      parts.push(`=== Document ${i + 1} — autre couche de lecture ===\n${clipped}`);
    }
  });
  return parts.join("\n\n");
}
