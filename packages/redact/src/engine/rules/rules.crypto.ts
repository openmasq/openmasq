import type { RedactionRule } from "../../types";
import { BIP39_WORDS } from "./bip39.words";
import { SP } from "./rules.international.util";
import { isBitcoinLegacyAddress } from "../validators/base58check";

// Cryptocurrency wallet addresses (category "secret", via type "crypto") — Bitcoin included.
// `rules.ts` keeps only Ethereum (`0x…`) and spreads this list in its place, so the family
// has ONE home.
//
// FP discipline: an address rule may be BARE only when it is genuinely distinctive
// — a human-readable bech32 prefix (`ltc1`/`cosmos1`/`bitcoincash:`) or a length no
// ordinary token has (Monero's 95 chars). A base58 run with only a single leading
// letter (`L`/`M`, `D`, `T`, `r`) is NOT distinctive — a random 34-char base58 id on
// a browsed page starts with those too — so those are CONTEXT-GATED (fire only with a
// wallet/chain keyword nearby). base58 = `[1-9A-HJ-NP-Za-km-z]`.
//
// ⚠️ Bitcoin's LEGACY branch was the counter-example, and it cost: bare, it redact every
// base58 id of 26-34 chars starting with 1 or 3 — a Notion page id among them, and INSIDE
// URLs at that (`crypto` → `secret`, which the URL guard exempts). `validators/base58check.ts`
// now qualifies it. That file is also the answer to the old note here that a real base58check
// "would need SHA-256, which this browser-safe package can't pull in": SHA-256 is ~40 lines of
// pure TS, and `crypto.subtle` was the real obstacle (async, and a `validate` is sync).
// The other single-letter base58 chains stay gated — their checksums are not all the same.
const CRYPTO_CTX =
  "wallet|adresse|address|portefeuille|crypto|litecoin|ltc|dogecoin|doge|tron|trx|ripple|xrp|solana|sol|phantom";
const cgate = (core: string): RegExp =>
  new RegExp(`(?<=\\b(?:${CRYPTO_CTX})\\b[\\s:=#'"-]{0,14})(?:${core})`, "gi");

/** Valid BIP-39 mnemonic: an EXACT standard word count, every word in the list. */
function isSeedPhrase(match: string): boolean {
  const words = match.trim().split(/\s+/);
  if (![12, 15, 18, 21, 24].includes(words.length)) return false;
  return words.every((w) => BIP39_WORDS.has(w));
}

export const CRYPTO_RULES: RedactionRule[] = [
  // Bitcoin, in TWO rules because their proof isn't the same: bech32 is
  // literal-distinctive and self-sufficient; the legacy form is only a base58 run, so
  // it goes through base58check. At the HEAD of the list: `rules.ts` had them there, and the
  // ORDER of the rules decides who claims the span (and hence its category).
  { type: "crypto", pattern: /\bbc1[a-z0-9]{25,62}\b/g },
  {
    type: "crypto",
    pattern: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
    validate: isBitcoinLegacyAddress,
  },
  // Distinctive → safe bare.
  { type: "crypto", pattern: /\b[48][1-9A-HJ-NP-Za-km-z]{94}\b/g }, // Monero (95 chars)
  { type: "crypto", pattern: /\bltc1[a-z0-9]{20,60}\b/g }, // Litecoin bech32
  { type: "crypto", pattern: /\bcosmos1[a-z0-9]{38}\b/g }, // Cosmos bech32
  { type: "crypto", pattern: /\bbitcoincash:[qp][a-z0-9]{41}\b/g }, // Bitcoin Cash CashAddr
  { type: "crypto", pattern: /\baddr1[a-z0-9]{50,}\b/g }, // Cardano Shelley bech32

  // Solana: prefix-LESS base58 (32-44 chars, any leading char) — nothing distinctive
  // to anchor on, so context-gated like the single-letter base58 families below.
  { type: "crypto", pattern: cgate(String.raw`[1-9A-HJ-NP-Za-km-z]{32,44}`) },

  // BIP-39 mnemonic SEED PHRASE — the catastrophic one (it IS the wallet, no
  // revocation). 12/15/18/21/24 consecutive lowercase words ALL in the official
  // 2048-word list is checksum-grade on its own: the list carries no article/
  // pronoun function words, so ordinary prose virtually always breaks the run.
  // `longestValidPrefix` recovers the mnemonic when the greedy match swallowed a
  // trailing in-list word. Lowercase-only (no `i`) — the standard presentation,
  // and Title-cased prose would multiply FP chances.
  {
    type: "crypto",
    // The word separator carries the NO-BREAK spaces too (shared `SP`): a mnemonic
    // pasted from a wallet UI or a PDF backup sheet is NBSP-joined, and a plain `[ ]`
    // left the whole recovery phrase — the highest-value secret there is — in CLEAR.
    pattern: new RegExp(String.raw`\b(?:[a-z]{3,8}(?:${SP}|\t)+){11,23}[a-z]{3,8}\b`, "g"),
    validate: isSeedPhrase,
  },

  // Single-leading-letter base58 → context-gated (else they FP on random base58 ids).
  { type: "crypto", pattern: cgate(String.raw`[LM][1-9A-HJ-NP-Za-km-z]{26,33}`) }, // Litecoin legacy
  { type: "crypto", pattern: cgate(String.raw`D[1-9A-HJ-NP-Za-km-z]{33}`) }, // Dogecoin
  { type: "crypto", pattern: cgate(String.raw`T[1-9A-HJ-NP-Za-km-z]{33}`) }, // Tron (TRX)
  { type: "crypto", pattern: cgate(String.raw`r[1-9A-HJ-NP-Za-km-z]{25,34}`) }, // Ripple (XRP)
];
