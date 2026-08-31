// Base58Check — the validator of a LEGACY Bitcoin address (`1…` P2PKH, `3…` P2SH).
//
// ⚠️ Why it exists: the Bitcoin rule was BARE (`[13][a-km-zA-HJ-NP-Z1-9]{25,34}`),
// so it caught every base58 identifier of 26-34 characters starting with 1 or 3 —
// including a Notion page id (`36db8e7d426681e79f43d3395ddc1f87`, measured). And since
// `crypto` maps onto the `secret` category, which is in `URL_EXEMPT_KINDS`, the id was
// redacted EVEN INSIDE A URL, whether « Adresses web » was ON or OFF: neither the URL
// guard nor `structuralUrlHosts` could cover it, the credential exemption coming
// first — rightly so.
//
// This is NOT a fail-open, it is precision: a real address carries 4 bytes of
// SHA-256d checksum and always passes them, only non-addresses fall. It is
// exactly the first branch of the `engine/CLAUDE.md` bar (checksum-validated).
// The `bc1…` branch (bech32) does not come through here — its literal prefix qualifies it.
//
// SHA-256 is reimplemented here, in ~40 lines, rather than imported: the package's core is
// BROWSER-SAFE (no `node:crypto`) and `crypto.subtle` is ASYNCHRONOUS, whereas a rule's
// `validate` is synchronous by contract.

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** SHA-256 of a byte array → 32 bytes. Reference implementation, unoptimised:
 *  it only runs on ≤ 34 characters, at the frequency of a rule match. */
function sha256(bytes: Uint8Array): Uint8Array {
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  new DataView(padded.buffer).setUint32(padded.length - 4, len << 3, false);

  const w = new Uint32Array(64);
  const view = new DataView(padded.buffer);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, hh];
    for (let t = 0; t < 8; t++) h[t] = (h[t] + next[t]) >>> 0;
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let t = 0; t < 8; t++) ov.setUint32(t * 4, h[t], false);
  return out;
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** base58 decoding → bytes. `null` on a character outside the alphabet. Long base-256
 *  multiplication (no BigInt: short input, and the package also targets old runtimes). */
function base58Decode(s: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const ch of s) {
    const value = ALPHABET.indexOf(ch);
    if (value < 0) return null;
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Every leading « 1 » is a leading zero byte (that is the base58check convention, and
  // it is what makes a P2PKH address start with « 1 »).
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

/**
 * A valid LEGACY Bitcoin address: 25 bytes (1 version + 20 of hash + 4 of checksum),
 * version 0x00 (P2PKH, « 1… ») or 0x05 (P2SH, « 3… »), and sha256d of the first 21 bytes
 * whose first 4 equal the carried checksum.
 */
export function isBitcoinLegacyAddress(s: string): boolean {
  const bytes = base58Decode(s.trim());
  if (!bytes || bytes.length !== 25) return false;
  if (bytes[0] !== 0x00 && bytes[0] !== 0x05) return false;
  const digest = sha256(sha256(bytes.subarray(0, 21)));
  for (let i = 0; i < 4; i++) if (digest[i] !== bytes[21 + i]) return false;
  return true;
}

/** base58 encoding of bytes — the inverse of `base58Decode`, to BUILD an address. */
function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const b of bytes) {
    let carry = b;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (const b of bytes) {
    if (b !== 0) break;
    out += "1"; // a leading null byte = a leading « 1 »
  }
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

/**
 * A FAKE legacy Bitcoin address that also passes the base58check.
 *
 * ⚠️ Without this, the fake was a character-by-character scramble (`fakeToken`): it
 * started with any letter, passed no checksum, and therefore did not
 * look like an address. This is the `model/CLAUDE.md` rule — « le faux de
 * TOUT identifiant à somme de contrôle passe SA propre somme : un faux qui échoue invite le
 * modèle à le "corriger", et la correction ne se retourne plus ». It holds all the more
 * now that DETECTION requires the base58check: an invalid fake would not even be
 * re-detected as an address by our own engine.
 *
 * The VERSION is preserved (« 1… » stays « 1… », « 3… » stays « 3… ») and only the 20
 * hash bytes are redrawn, deterministic on the seed — so same value, same fake.
 * `null` if the original is not a valid legacy address: the caller keeps its
 * scramble, behaviour unchanged (bech32 included).
 */
export function fakeBitcoinLegacyAddress(value: string, seed: number): string | null {
  const bytes = base58Decode(value.trim());
  if (!bytes || bytes.length !== 25 || !isBitcoinLegacyAddress(value)) return null;
  const out = new Uint8Array(25);
  out[0] = bytes[0];
  let h = seed >>> 0;
  for (let i = 1; i <= 20; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    out[i] = (h >>> 16) & 0xff;
  }
  const digest = sha256(sha256(out.subarray(0, 21)));
  out.set(digest.subarray(0, 4), 21);
  return base58Encode(out);
}
