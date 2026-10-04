// docTR OCR engine barrel (Node-only, lazy heavy deps). The engine implements the
// model-agnostic `OcrEngine`; the router in `../ocr` decides docTR-vs-Tesseract.
export { doctrEngine } from "./engine";
