import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { doctrIntegrityEnv } from "../ocr/doctrModels";

/**
 * Point the OCR engine at the BUNDLED, signed, sha256-pinned traineddata (audit M8) so a
 * packaged build never TOFU-downloads it from the jsdelivr CDN into the native Tesseract WASM
 * parser (which runs in the privileged main process). `@openmasq/redact` `ocr.ts` reads
 * `OPENMASQ_TESSERACT_LANG_PATH` lazily (at first OCR); when it's set it loads the uncompressed
 * `<lang>.traineddata` OFFLINE and verifies each against `OCR_TRAINEDDATA_SHA256` before the
 * bytes reach the parser (fail-closed). Dev (not packaged) leaves it unset → the existing
 * https-only, redirect-scheme-revalidated, size-capped CDN fallback (unpinned; dev-only).
 *
 * Mirrors `localNer.ts` `bundledNerDir()`: resolved from `process.resourcesPath`, guarded on
 * the dir actually existing (so a build missing the bake degrades to the CDN instead of failing).
 */
export function configureBundledOcr(): void {
  if (!app.isPackaged) return;
  if (process.env.OPENMASQ_TESSERACT_LANG_PATH) return; // an explicit override wins
  const dir = join(process.resourcesPath, "tesseract-langs");
  if (existsSync(dir)) process.env.OPENMASQ_TESSERACT_LANG_PATH = dir;
}

/**
 * Point the OCR ROUTER at the BUNDLED docTR models (`${resourcesPath}/doctr-models`, baked +
 * sha256-verified by `scripts/bake-doctr-models.ts`, shipped via `electron-builder.cjs`
 * `extraResources`). When set, `@openmasq/redact` `ocr.ts` runs **docTR for LATIN scripts**
 * (far higher accuracy) and falls back to Tesseract for non-latin — see the router. Loaded
 * 100% OFFLINE; each model is sha256-verified against the AUTHORITATIVE in-code pin
 * (`OPENMASQ_DOCTR_INTEGRITY`, from `doctrModels.ts` — not a co-located file) before onnxruntime
 * parses it, and `OPENMASQ_DOCTR_REQUIRE_PIN=1` REJECTS an unpinned model (defence in depth).
 * **Same system in DEV as in prod:** packaged ⇒ `${resourcesPath}/doctr-models`; dev ⇒ the
 * bake output `apps/desktop/build/doctr-models` (resolved from `__dirname` = `out/main`, main
 * bundle is CJS). So `pnpm dev` runs docTR too once `pnpm bake:doctr` has produced the dir —
 * missing dir (bake not run) ⇒ Tesseract-only, no failure. `OPENMASQ_DOCTR_MODEL_PATH` overrides.
 *
 * NB: extraction (pdf.js + OCR) now runs in the dedicated WORKER
 * (`../ocr/extractClient.ts`) — the main-thread cost per page (rasterization, DBNet/CTC,
 * PNG) blocked IPC in ~1 s bursts (measured 13/08). These env vars are still set
 * on MAIN's process.env: the client copies them into the worker's minimal env.
 */
export function configureBundledDoctr(): void {
  if (process.env.OPENMASQ_DOCTR_MODEL_PATH) return; // an explicit override wins
  const dir = app.isPackaged
    ? join(process.resourcesPath, "doctr-models")
    : join(__dirname, "..", "..", "build", "doctr-models"); // out/main → apps/desktop/build/…
  if (!existsSync(dir)) return; // bake not run ⇒ Tesseract-only (no failure)
  process.env.OPENMASQ_DOCTR_MODEL_PATH = dir;
  if (!process.env.OPENMASQ_DOCTR_INTEGRITY) process.env.OPENMASQ_DOCTR_INTEGRITY = doctrIntegrityEnv();
  if (!process.env.OPENMASQ_DOCTR_REQUIRE_PIN) process.env.OPENMASQ_DOCTR_REQUIRE_PIN = "1";
}
