// Base58Check — le validateur d'une adresse Bitcoin HÉRITÉE (`1…` P2PKH, `3…` P2SH).
//
// ⚠️ Pourquoi il existe : la règle Bitcoin était NUE (`[13][a-km-zA-HJ-NP-Z1-9]{25,34}`),
// donc elle attrapait tout identifiant base58 de 26-34 caractères commençant par 1 ou 3 —
// dont un id de page Notion (`36db8e7d426681e79f43d3395ddc1f87`, mesuré). Et comme
// `crypto` mappe sur la catégorie `secret`, qui est dans `URL_EXEMPT_KINDS`, l'id était
// redacted MÊME À L'INTÉRIEUR D'UNE URL, que « Adresses web » soit ON ou OFF : ni la garde
// URL ni `structuralUrlHosts` ne pouvaient le couvrir, l'exemption credential passant
// avant — à raison.
//
// Ce n'est PAS un fail-open, c'est de la précision : une vraie adresse porte 4 octets de
// somme de contrôle SHA-256d et les passe toujours, seules les non-adresses tombent. C'est
// exactement la première branche de la barre du `engine/CLAUDE.md` (checksum-validated).
// La branche `bc1…` (bech32) ne passe pas par ici — son préfixe littéral la qualifie déjà.
//
// SHA-256 est réimplémenté ici, en ~40 lignes, plutôt qu'importé : le cœur du paquet est
// BROWSER-SAFE (pas de `node:crypto`) et `crypto.subtle` est ASYNCHRONE, alors qu'un
// `validate` de règle est synchrone par contrat.

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

/** SHA-256 d'un tableau d'octets → 32 octets. Implémentation de référence, non optimisée :
 *  elle ne tourne que sur ≤ 34 caractères, à la fréquence d'un match de règle. */
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

/** Décodage base58 → octets. `null` sur un caractère hors alphabet. Multiplication longue
 *  base-256 (pas de BigInt : entrée courte, et le paquet vise aussi de vieux runtimes). */
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
  // Chaque « 1 » de tête est un octet nul de tête (c'est la convention base58check, et
  // c'est ce qui fait qu'une adresse P2PKH commence par « 1 »).
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

/**
 * Une adresse Bitcoin HÉRITÉE valide : 25 octets (1 version + 20 de hash + 4 de somme),
 * version 0x00 (P2PKH, « 1… ») ou 0x05 (P2SH, « 3… »), et sha256d des 21 premiers octets
 * dont les 4 premiers égalent la somme portée.
 */
export function isBitcoinLegacyAddress(s: string): boolean {
  const bytes = base58Decode(s.trim());
  if (!bytes || bytes.length !== 25) return false;
  if (bytes[0] !== 0x00 && bytes[0] !== 0x05) return false;
  const digest = sha256(sha256(bytes.subarray(0, 21)));
  for (let i = 0; i < 4; i++) if (digest[i] !== bytes[21 + i]) return false;
  return true;
}

/** Encodage base58 d'octets — l'inverse de `base58Decode`, pour FABRIQUER une adresse. */
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
    out += "1"; // un octet nul de tête = un « 1 » de tête
  }
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

/**
 * Un FAUX d'adresse Bitcoin héritée qui passe lui aussi le base58check.
 *
 * ⚠️ Sans ça, le faux était un brouillage caractère par caractère (`fakeToken`) : il
 * commençait par n'importe quelle lettre, ne passait aucune somme de contrôle, et ne
 * ressemblait donc pas à une adresse. C'est la règle du `model/CLAUDE.md` — « le faux de
 * TOUT identifiant à somme de contrôle passe SA propre somme : un faux qui échoue invite le
 * modèle à le "corriger", et la correction ne se retourne plus ». Elle vaut d'autant plus
 * depuis que la DÉTECTION exige le base58check : un faux invalide ne serait même pas
 * re-détecté comme une adresse par notre propre moteur.
 *
 * La VERSION est conservée (« 1… » reste « 1… », « 3… » reste « 3… ») et seuls les 20
 * octets de hash sont retirés, déterministes sur la graine — donc même valeur, même faux.
 * `null` si l'original n'est pas une adresse héritée valide : l'appelant garde son
 * brouillage, comportement inchangé (bech32 compris).
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
