// The OCR language set + its traineddata integrity pins — ONE source of truth,
// shared by the desktop OCR (`../ocr/ocr.ts` joins the langs with "+") and the
// extension (which bundles one `.traineddata.gz` per code). Split out of core.ts;
// edit the language set and its digest map TOGETHER, here only.

/** OCR languages (Tesseract `.traineddata` codes) — the world's most-used, across
 *  Latin / Cyrillic / Arabic / Devanagari / CJK scripts. Keep in sync with the
 *  bundled asset list. */
export const OCR_LANGS = [
  "eng", "chi_sim", "spa", "hin", "ara",
  "fra", "por", "rus", "deu", "jpn", "ita", "kor",
] as const;

/**
 * SHA-256 (hex) of each bundled `<lang>.traineddata`, verified BYTE-FOR-BYTE against the
 * official `tesseract-ocr/tessdata_fast` repo (audit M8). The desktop bundles these exact
 * files and passes this map as tesseract2's `integrity` pin, so a tampered/substituted
 * traineddata is REJECTED before it reaches the native WASM parser (fail-closed) — closing
 * the "TOFU CDN traineddata → WASM parser" vector on the offline path. The extension bundles
 * the SAME files (`apps/extension/public/tesseract/langs/`). Regenerate with the desktop
 * `bake:tesseract` script, which re-downloads from tessdata_fast and re-verifies these hashes.
 */
export const OCR_TRAINEDDATA_SHA256: Readonly<Record<string, string>> = Object.freeze({
  eng: "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
  chi_sim: "a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730",
  spa: "6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464",
  hin: "4c73ffc59d497c186b19d1e90f5d721d678ea6b2e277b719bee4e2af12271825",
  ara: "e3206d3dc87fd50c24a0fb9f01838615911d25168f4e64415244b67d2bb3e729",
  fra: "ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca",
  por: "c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb",
  rus: "e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225",
  deu: "19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d",
  jpn: "1f5de9236d2e85f5fdf4b3c500f2d4926f8d9449f28f5394472d9e8d83b91b4d",
  ita: "b8f89e1e785118dac4d51ae042c029a64edb5c3ee42ef73027a6d412748d8827",
  kor: "6b85e11d9bbf07863b97b3523b1b112844c43e713df8b66418a081fd1060b3b2",
});
