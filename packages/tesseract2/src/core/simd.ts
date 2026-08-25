/*
 * WASM SIMD feature detection, shared by the Node + browser core loaders. Inlined
 * from GoogleChromeLabs/wasm-feature-detect (Apache-2.0): each byte array is a
 * minimal module using the instruction set in question; `WebAssembly.validate`
 * tells us if this engine accepts it. `WebAssembly` is a real global on both Node
 * (typed via ambient-node.d.ts) and the browser (DOM lib).
 */
export const SIMD_SUPPORT = WebAssembly.validate(new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
  10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
]));

export const RELAXED_SIMD_SUPPORT = WebAssembly.validate(new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
  10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11,
]));

/*
 * The tesseract.js-core build variants to try for this CPU, fastest-supported first
 * then progressively more portable. Bare names (no extension / package prefix); the
 * Node loader maps them to `tesseract.js-core/<name>` require specifiers, the browser
 * loader to `<coreDir>/<name>.wasm.js`. When `lstmOnly`, the non-LSTM full core is
 * appended as a final fallback — it ALSO runs the LSTM engine, so a bundle that ships
 * only the full core still works (the browser build relies on this).
 */
export const coreVariants = (lstmOnly: boolean): string[] => {
  const build = (lstm: boolean): string[] => {
    const suffix = lstm ? '-lstm' : '';
    const out: string[] = [];
    if (RELAXED_SIMD_SUPPORT) out.push(`tesseract-core-relaxedsimd${suffix}`);
    if (SIMD_SUPPORT) out.push(`tesseract-core-simd${suffix}`);
    out.push(`tesseract-core${suffix}`);
    return out;
  };
  const names = lstmOnly ? [...build(true), ...build(false)] : build(false);
  return [...new Set(names)];
};
