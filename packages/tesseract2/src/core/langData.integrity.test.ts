import { describe, expect, it } from 'vitest';
import { verifyIntegrity } from './langData';
import { ValidationError } from './errors';
import type { WorkerPlatform, Sha256Digest } from '../platform/types';

/*
 * Traineddata integrity pin — the ONE fail-closed gate shared by every consumer that
 * supplies `integrity[lang]` to `createWorker`: the browser EXTENSION (`apps/extension`,
 * audit M8 parity) AND the desktop OCR (`@openmasq/redact` `ocr.ts`), both passing
 * `OCR_TRAINEDDATA_SHA256` (verified vs the official `tesseract-ocr/tessdata_fast`). A
 * regression here — a comparison that fails OPEN — would let a tampered/substituted
 * `.traineddata` reach the Tesseract C++/WASM parser (arbitrary code exec), the exact
 * risk CLAUDE.md hard rule 7 forbids. So the wrong-digest path MUST throw.
 *
 * The bytes never need hashing here: `platform.sha256` is injected, so we assert the
 * COMPARISON logic (hex, `sha256-<b64>`, case/whitespace tolerance, and — critically —
 * rejection) against a known digest, deterministically and without a real crypto backend.
 */
const DATA = new Uint8Array([1, 2, 3, 4]); // opaque — the stub decides its "hash"

function platformWithDigest(d: Sha256Digest): WorkerPlatform {
  // Only `sha256` is exercised by `verifyIntegrity`; the rest throw if ever touched, so a
  // future change that reaches for another primitive fails loudly instead of silently.
  return new Proxy(
    { sha256: async (_: Uint8Array): Promise<Sha256Digest> => d },
    {
      get(target, prop, recv) {
        if (prop === 'sha256') return Reflect.get(target, prop, recv);
        throw new Error(`unexpected platform.${String(prop)} in verifyIntegrity`);
      },
    },
  ) as unknown as WorkerPlatform;
}

const DIGEST: Sha256Digest = {
  hex: '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
  b64: 'n2SnR+G5fxMfq7a0Rylsm28CAeeftMU1bmx36YtqgGo=',
};

describe('verifyIntegrity — traineddata sha256 fail-closed pin', () => {
  it('accepts a matching bare-hex digest', async () => {
    await expect(verifyIntegrity(DATA, DIGEST.hex, 'eng', platformWithDigest(DIGEST))).resolves.toBeUndefined();
  });

  it('accepts a matching "sha256-<base64>" digest', async () => {
    await expect(
      verifyIntegrity(DATA, `sha256-${DIGEST.b64}`, 'eng', platformWithDigest(DIGEST)),
    ).resolves.toBeUndefined();
  });

  it('is case-insensitive + trims whitespace on the expected hex', async () => {
    await expect(
      verifyIntegrity(DATA, `  ${DIGEST.hex.toUpperCase()}  `, 'eng', platformWithDigest(DIGEST)),
    ).resolves.toBeUndefined();
  });

  it('REJECTS a mismatched digest — fail-closed (tampered traineddata never runs)', async () => {
    const bad = 'deadbeef' + DIGEST.hex.slice(8);
    await expect(verifyIntegrity(DATA, bad, 'eng', platformWithDigest(DIGEST))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('REJECTS an empty / malformed expected digest rather than passing', async () => {
    await expect(verifyIntegrity(DATA, '', 'eng', platformWithDigest(DIGEST))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(verifyIntegrity(DATA, 'not-a-hash', 'eng', platformWithDigest(DIGEST))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('does NOT confuse the base64 form with the hex form (no cross-format fall-open)', async () => {
    // Passing the raw b64 (without the `sha256-` prefix) must NOT validate.
    await expect(verifyIntegrity(DATA, DIGEST.b64, 'eng', platformWithDigest(DIGEST))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
