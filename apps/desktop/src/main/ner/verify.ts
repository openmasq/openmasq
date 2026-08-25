// Fail-closed sha256 integrity check for the bundled NER weight files. Pure: the file read
// + digest are INJECTED, so it runs in the worker (node fs/crypto) AND in the bake, and is
// unit-testable without the real 278 MB model. Any missing file or hash mismatch THROWS — the
// worker's caller then rejects and the renderer fails closed (degrades to the regex rules),
// so tampered/substituted weights never reach onnxruntime.

export interface WeightEntry {
  /** Absolute path to the weight file to verify. */
  path: string;
  /** Expected sha256 (hex, lowercase). */
  sha256: string;
}

/**
 * Verify each entry's sha256. Throws (fail-closed) on the first missing/unreadable file or
 * hash mismatch. `readFile` yields the raw bytes; `sha256` returns the lowercase hex digest.
 */
export async function verifyWeights(
  entries: WeightEntry[],
  readFile: (path: string) => Promise<Uint8Array>,
  sha256: (bytes: Uint8Array) => string,
): Promise<void> {
  for (const { path, sha256: want } of entries) {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(path);
    } catch (cause) {
      throw new Error(`NER weight file missing or unreadable: ${path}`, { cause });
    }
    const got = sha256(bytes);
    if (got !== want.toLowerCase()) {
      throw new Error(`NER weight integrity check failed for ${path} (expected ${want}, got ${got}).`);
    }
  }
}
