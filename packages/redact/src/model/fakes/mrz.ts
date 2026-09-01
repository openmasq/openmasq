import { hashString, seedFrom } from "./primitives";

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
    if (/\d/.test(c)) return String((h + i++ * 7 + Number(c) + 3) % 10);
    return String.fromCharCode(65 + ((h + i++ * 11 + c.charCodeAt(0)) % 26));
  });
}
