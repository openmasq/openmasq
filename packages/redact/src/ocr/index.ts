// OCR subsystem, consolidated (audit P4 — it was scattered across the src root, the
// documents/ folder and a sibling doctr/ folder). All INTERNAL (no public subpath):
//   ocr.ts    — the fallback Tesseract engine + `ocrImage`/`ocrImageLayout` +
//               the docTR router (`preferDoctr` gate, Tesseract fallback)
//   pdf.ts    — `ocrPdf`: scanned-PDF rasterisation feeding the same router
//   engine.ts — the model-agnostic `OcrEngine` contract + `OcrPage`/routing signals
//   layout.ts — layout-aware OCR text (`ocrWordsToText`/`ocrWordsToLayout`, confidence floor)
//   doctr/    — the docTR engine (DBNet+CRNN, onnxruntime, sha256-pinned, fail-closed)
// `../ocr` (documents/node.ts) resolves here.
export * from "./ocr";
export * from "./pdf";
export * from "./layout";
export * from "./engine";
