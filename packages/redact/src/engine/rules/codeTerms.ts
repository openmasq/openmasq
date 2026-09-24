// Published algorithm / encoding / format NAMES that are byte-for-byte the shape of a
// lowercase key — `argon2id`, `secp256k1`, `aes256gcm`, `b64encode`, `SHA1PRNG`. The generic
// token rule cannot tell them from a real secret by SHAPE (that is why `isCodeIdentifier`,
// which keys on a camelCase hump, does not reach them), so a coding agent reading crypto code
// had them RENAMED and the code stopped compiling. They are never a secret VALUE — they are
// public identifiers everyone writes the same way — so a CLOSED allow-list is the right filter,
// the same discipline as the vendor-prefix table and the benign-config values. Extend it as a
// name proves it slips the shape guards; never widen it to a shape.
//
// Only the 8+ char, digit-bearing names that actually slip need listing (the token rule has an
// 8-char floor, so `argon2i`/`aes128` already pass). Compared lower-cased, whole-value only.
const CODE_TERMS = new Set<string>([
  // Password hashing / KDF
  "argon2id",
  "argon2ad",
  "pbkdf2sha256",
  "pbkdf2sha512",
  "bcryptsha256",
  // Elliptic curves
  "secp256k1",
  "secp256r1",
  "secp384r1",
  "secp521r1",
  "prime256v1",
  "brainpoolp256r1",
  // AEAD / ciphers
  "aes128gcm",
  "aes192gcm",
  "aes256gcm",
  "aes128cbc",
  "aes256cbc",
  "aes256ctr",
  "chacha20poly1305",
  "xchacha20poly1305",
  // Hashes / digests
  "sha1prng",
  "sha224",
  "sha384",
  "sha512224",
  "sha512256",
  "keccak256",
  "keccak512",
  "ripemd160",
  "blake2b512",
  "blake2s256",
  "whirlpool512",
  // Encoding helpers + names an all-lowercase code token shares with a lowercase key's shape
  // (no camelCase hump for `isCodeIdentifier` to read), so only a name spares them.
  "b64encode",
  "b64decode",
  "b32encode",
  "b32decode",
  "b16encode",
  "urlsafeb64encode",
  "base64url",
  "base32hex",
  "base16",
  "base58btc",
  "base36",
  // CSS 3-D transforms
  "translate3d",
  "matrix3d",
  "rotate3d",
  "scale3d",
  // Postgres range / numeric types
  "int4range",
  "int8range",
  "numrange",
  "tsrange",
  "tstzrange",
  "daterange",
  "int8multirange",
]);

/** Is `value` a published algorithm/encoding name (never a secret)? Whole-value, case-blind. */
export const isCodeTerm = (value: string): boolean => CODE_TERMS.has(value.toLowerCase());

/**
 * A Subresource-Integrity / npm-lockfile INTEGRITY HASH — `sha512-<base64>`, `sha384-<base64>`,
 * `sha256-<base64>`. It is a PUBLIC content checksum of a published asset (the SRI spec, the
 * lockfile `integrity` field, an HTML `integrity=` attribute), never a secret — the algorithm
 * name is literally its prefix, which no key carries. The generic token rule reads the base64
 * body as a key and RENAMES it, corrupting the lockfile/manifest the agent reads. Prefix-gated,
 * so it can never spare an actual key.
 *
 * ⚠️ No LENGTH floor, because this is handed the HEAD of a hash as often as a whole one: `+`
 * and `/` are base64 but not token characters, so the rule cuts an SRI at the first of them
 * and only this first piece still carries the prefix (its lookbehind excludes the pieces
 * after). Where that cut falls is the base64's business — `sha512-c7jFQRklXua0mTz+…` leaves
 * fifteen characters, and a floor of sixteen renamed it, i.e. half the hash. The PREFIX is
 * the whole evidence here, literal-distinctive exactly like a vendor's key prefix.
 */
export const isIntegrityHash = (value: string): boolean =>
  /^sha(?:1|224|256|384|512)-[A-Za-z0-9+/_-]*={0,2}$/i.test(value);

/**
 * A C/JS/Rust/Go NUMERIC LITERAL — hex `0xFF00AA`, octal `0o755`, binary `0b1010` — which the
 * generic token rule reads as a key (the `x`/`o`/`b` is its only "non-hex letter") and RENAMES,
 * breaking a bitmask, a colour or a flag constant. A literal is a NUMBER, never a secret. Hex is
 * bounded to 16 digits (a 64-bit value): a longer `0x…` run is a hash or a wallet, kept masked
 * (a 40-hex address also has its own crypto rule). Octal/binary have no such collision.
 */
export const isNumericLiteral = (value: string): boolean =>
  /^0[xX][0-9a-fA-F]{1,16}$/.test(value) ||
  /^0[oO][0-7]+$/.test(value) ||
  /^0[bB][01]+$/.test(value);

const VOWEL = /[aeiouyàâäéèêëïîôöùûü]/i;

/**
 * A camelCase / PascalCase CODE IDENTIFIER with a digit among its letters — `Uint8Array`,
 * `H2Database`, `Float32x4` — which the token rule otherwise RENAMES, breaking the code. Three
 * signals split it from a key AND from glued prose: MIXED CASE (an uppercase — all-lowercase
 * glued prose « earticle3du » has none, so it stays masked, the trade pinned in
 * `gluedProse.test.ts`; an all-lowercase code name like `int8range` rides `codeTerms.ts`);
 * SHORT (≤16, each run ≤12); and WORD STRUCTURE — every letter run is a single-letter marker or
 * a pronounceable run (a vowel), at least one a real word (≥3 + vowel), so a key's consonant
 * clusters (`Kj4Xr9Bv`) are never spared.
 */
export function isCodeIdentifier(s: string): boolean {
  if (s.length > 16 || !/^[A-Za-z][A-Za-z0-9]*$/.test(s)) return false;
  if (!/[A-Z]/.test(s) || !/\d/.test(s)) return false;
  const segs = s.split(/\d+/).filter(Boolean);
  let hasWord = false;
  for (const seg of segs) {
    if (seg.length === 1) continue;
    if (seg.length > 12 || !VOWEL.test(seg)) return false;
    if (seg.length >= 3) hasWord = true;
  }
  return hasWord;
}

/**
 * A run with almost no character DIVERSITY — `000000000s`, `aaaaaaaa1`, `--------x`.
 *
 * The generic token rule exists for what is "long and high-entropy in a way ordinary text
 * never is" (`engine/CLAUDE.md`, the precision bar). A string built from three distinct
 * characters is the opposite of that: it is padding, a placeholder, a column of zeroes in a
 * fixture. A real key of this length draws from dozens of symbols.
 *
 * Deliberately generous — THREE distinct characters, not "looks random" — so nothing is
 * refused that could plausibly have been drawn at random.
 */
export function isLowEntropyRun(value: string): boolean {
  if (value.length < 8) return false;
  return new Set(value).size <= 3;
}
