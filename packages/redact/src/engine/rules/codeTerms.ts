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
  "argon2id", "argon2ad", "pbkdf2sha256", "pbkdf2sha512", "bcryptsha256",
  // Elliptic curves
  "secp256k1", "secp256r1", "secp384r1", "secp521r1", "prime256v1", "brainpoolp256r1",
  // AEAD / ciphers
  "aes128gcm", "aes192gcm", "aes256gcm", "aes128cbc", "aes256cbc", "aes256ctr",
  "chacha20poly1305", "xchacha20poly1305",
  // Hashes / digests
  "sha1prng", "sha224", "sha384", "sha512224", "sha512256", "keccak256", "keccak512",
  "ripemd160", "blake2b512", "blake2s256", "whirlpool512",
  // Encoding helpers
  "b64encode", "b64decode", "b32encode", "b32decode", "b16encode", "urlsafeb64encode",
]);

/** Is `value` a published algorithm/encoding name (never a secret)? Whole-value, case-blind. */
export const isCodeTerm = (value: string): boolean => CODE_TERMS.has(value.toLowerCase());

/**
 * A C/JS/Rust/Go NUMERIC LITERAL — hex `0xFF00AA`, octal `0o755`, binary `0b1010` — which the
 * generic token rule reads as a key (the `x`/`o`/`b` is its only "non-hex letter") and RENAMES,
 * breaking a bitmask, a colour or a flag constant. A literal is a NUMBER, never a secret. Hex is
 * bounded to 16 digits (a 64-bit value): a longer `0x…` run is a hash or a wallet, kept masked
 * (a 40-hex address also has its own crypto rule). Octal/binary have no such collision.
 */
export const isNumericLiteral = (value: string): boolean =>
  /^0[xX][0-9a-fA-F]{1,16}$/.test(value) || /^0[oO][0-7]+$/.test(value) || /^0[bB][01]+$/.test(value);
