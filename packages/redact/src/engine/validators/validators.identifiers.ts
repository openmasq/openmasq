// Post-match validators for the extra structured identifiers (IMEI, VIN, LATAM
// tax ids, RIB…). Same contract as `validators.ts`: a regex hit is only redacted
// when the validator confirms its checksum, so a random look-alike digit/alnum run
// (an order number, a 17-char token) is left in clear. Pure, no deps, unit-tested.

/** Luhn (mod-10) over a bare digit string. */
function luhnOk(d: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** IMEI — 15 digits (separators stripped) confirmed by Luhn. */
export function imeiValid(m: string): boolean {
  const d = m.replace(/\D/g, "");
  return d.length === 15 && luhnOk(d);
}

/** SIM ICCID — 19–20 digits confirmed by the ITU-T E.118 Luhn check digit. */
export function iccidValid(m: string): boolean {
  const d = m.replace(/\D/g, "");
  return (d.length === 19 || d.length === 20) && luhnOk(d);
}

// VIN (ISO 3779) — 17 chars, no I/O/Q. Letters transliterate to digits; a weighted
// sum mod 11 gives the check digit at position 9 (10 → 'X'). This checksum is what
// keeps the 17-alnum shape from grabbing any 17-char token.
const VIN_TRANS: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
export function vinValid(m: string): boolean {
  const s = m.toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const v = VIN_TRANS[s[i]];
    if (v === undefined) return false;
    sum += v * VIN_WEIGHTS[i];
  }
  const check = sum % 11;
  return s[8] === (check === 10 ? "X" : String(check));
}

// France RIB — banque(5) + guichet(5) + compte(11, letters allowed) + clé(2). The
// account letters transliterate to digits, then (89·banque + 15·guichet + 3·compte
// + clé) mod 97 must be 0. Both context-gated AND checksummed → essentially no FP.
const RIB_LETTER: Record<string, string> = {
  A: "1", J: "1", B: "2", K: "2", S: "2", C: "3", L: "3", T: "3",
  D: "4", M: "4", U: "4", E: "5", N: "5", V: "5", F: "6", O: "6", W: "6",
  G: "7", P: "7", X: "7", H: "8", Q: "8", Y: "8", I: "9", R: "9", Z: "9",
};
function mod97(numStr: string, factor: number): number {
  let rem = 0;
  for (const ch of numStr) rem = (rem * 10 + (ch.charCodeAt(0) - 48)) % 97;
  return (rem * (factor % 97)) % 97;
}
export function ribValid(m: string): boolean {
  const s = m.replace(/\s/g, "").toUpperCase();
  if (!/^\d{10}[0-9A-Z]{11}\d{2}$/.test(s)) return false;
  const banque = s.slice(0, 5);
  const guichet = s.slice(5, 10);
  const compte = s.slice(10, 21);
  const cle = s.slice(21, 23);
  let compteDigits = "";
  for (const c of compte) {
    if (c >= "0" && c <= "9") compteDigits += c;
    else {
      const v = RIB_LETTER[c];
      if (!v) return false;
      compteDigits += v;
    }
  }
  const total = (mod97(banque, 89) + mod97(guichet, 15) + mod97(compteDigits, 3) + Number(cle)) % 97;
  return total === 0;
}

/** US SSN structural filter — reject impossible area/group/serial (00-area 000,
 *  666, 900-999; group 00; serial 0000). Doesn't validate a checksum (SSNs have
 *  none) but drops the obviously-invalid dashed runs. */
export function ssnValid(m: string): boolean {
  const mt = m.match(/^(\d{3})-(\d{2})-(\d{4})$/);
  if (!mt) return false;
  const area = Number(mt[1]);
  if (area === 0 || area === 666 || area >= 900) return false;
  if (Number(mt[2]) === 0) return false;
  if (Number(mt[3]) === 0) return false;
  return true;
}
