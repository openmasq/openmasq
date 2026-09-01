import { hashString, rehash, seedFrom } from "./primitives";

/** The fake of an MRZ (machine-readable zone, `isMrzShaped`): digits SHUFFLED like
 *  `fakeDigits`, and the LETTERS too — they carry the NAME, a fake that keeps them
 *  leaks the identity it claims to mask (observed: « IDFRASABOURDIN<<< » came back
 *  intact around fresh digits). Chevrons and punctuation preserved (the ISO 9303
 *  structure stays readable); the type+country prefix (« IDFRA ») is KEPT: it says
 *  « a French national ID card » without saying whose. Deterministic at equal salt, like the others. */
export function fakeMrz(value: string, salt: number, convKey?: Uint8Array): string {
  const compact = value.replace(/[^A-Z0-9]/g, "");
  const h = seedFrom(convKey, `mrz:${salt}`, compact, hashString(compact) + salt);
  const keep = /^ID[A-Z]{3}/.test(value) ? 5 : 0;
  let i = 0;
  let pos = 0;
  return value.replace(/[A-Z0-9]/g, (c) => {
    pos++;
    if (pos <= keep) return c;
    // ⚠️ Seed + position only. The LETTERS carry the holder's NAME, so folding the real
    // character in made an MRZ fake reverse to the passport holder — the very leak this
    // generator exists to prevent.
    const r = rehash(h ^ Math.imul(i++ + 1, 0x9e3779b1));
    if (/\d/.test(c)) return String(r % 10);
    return String.fromCharCode(65 + (r % 26));
  });
}
