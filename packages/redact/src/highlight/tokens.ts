import type { RedactionCategory, Vault } from "../types";
import { redactionCategory } from "../kinds";
import { spanKindLabel } from "./segments";

/**
 * DISPLAY tokens for the FAKES — the « [PERSON1] / [IBAN] » rendering the user can opt
 * into (Réglages, `redactTokenDisplay`) instead of seeing pseudonyms. It applies ONLY
 * where a pseudonym is what's displayed: the documents' redacted views. The conversation
 * marks show the user's REAL values and are never tokenised.
 *
 * DISPLAY-ONLY, by construction: nothing here touches the vault, the wire, or what the
 * model receives — the pseudonyms still ride the wire, and remain visible in the redaction
 * log and the hover reveals. These maps are consumed at RENDER time by the
 * document viewers (`displayReplacements.ts` in the ui package).
 *
 * Numbering: distinct values of one category are numbered in the order given
 * (`[PERSON1]`, `[PERSON2]`); a category holding a SINGLE value stays bare (`[IBAN]`).
 * Order comes from the vault's insertion order (chat) or the replacement list (document),
 * both stable for a given conversation/document — so the same value keeps the same token
 * across every message that shows it.
 */

/** Category → token word. Bare UPPERCASE English, compact on purpose (it sits inline in
 *  running text). Keys are the engine's `RedactionCategory` vocabulary. */
export const CATEGORY_TOKEN: Record<RedactionCategory, string> = {
  name: "PERSON",
  dob: "DOB",
  email: "EMAIL",
  phone: "PHONE",
  address: "ADDRESS",
  location: "LOCATION",
  company: "COMPANY",
  card: "CARD",
  iban: "IBAN",
  national_id: "ID",
  company_id: "COMPANY_ID",
  ip: "IP",
  number: "NUM",
  salary: "SALARY",
  path: "PATH",
  health: "HEALTH",
  username: "USERNAME",
  url: "URL",
  apikey: "APIKEY",
  secret: "SECRET",
};

/** One span to token: the REAL value plus whatever typing material exists. */
export interface TokenSpan {
  /** The real value (the map key — what the renderer looks up). */
  value: string;
  /** Its placeholder/fake, when known (category can be read from a marker or a shape). */
  placeholder?: string;
  /** Exact kind from the conversation's `kinds` map, when known — wins over the rest. */
  kind?: string;
}

function tokenWord(span: TokenSpan): string {
  const label = spanKindLabel(span.placeholder ?? "", span.value, span.kind);
  // `"sensitive"` is the segments' shapeless fallback (free text, no kind recorded) — it
  // must NOT normalise through `redactionCategory`, whose own fallback is `secret`: a
  // name-like span would then read `[SECRET]`. A neutral word is the honest rendering.
  if (label === "sensitive") return "INFO";
  return CATEGORY_TOKEN[redactionCategory(label)] ?? "INFO";
}

/**
 * Assign a display token to every DISTINCT `value`, in the order given. Returns
 * value → `[PERSON1]`-style token (bare when its category holds a single value).
 */
export function assignDisplayTokens(spans: TokenSpan[]): Map<string, string> {
  const wordOf = new Map<string, string>();
  for (const s of spans) {
    if (!s.value || wordOf.has(s.value)) continue;
    wordOf.set(s.value, tokenWord(s));
  }
  const total = new Map<string, number>();
  for (const w of wordOf.values()) total.set(w, (total.get(w) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const [value, w] of wordOf) {
    const n = (seen.get(w) ?? 0) + 1;
    seen.set(w, n);
    out.set(value, (total.get(w) ?? 1) > 1 ? `[${w}${n}]` : `[${w}]`);
  }
  return out;
}

/** Tokens for a conversation VAULT (placeholder → real), typed via `kinds` like the chat
 *  marks are coloured. Insertion order of the vault = the numbering order. */
export function vaultDisplayTokens(
  vault: Vault,
  kinds?: Record<string, string>,
): Map<string, string> {
  return assignDisplayTokens(
    Object.entries(vault)
      .filter(([, v]) => v.length > 0)
      .map(([placeholder, v]) => ({ value: v, placeholder, kind: kinds?.[v] })),
  );
}

/** Tokens for a document's replacement list (real → fake + kind), list order = numbering
 *  order. Keyed by the REAL value, like {@link vaultDisplayTokens}. */
export function replacementDisplayTokens(
  replacements: { real: string; fake?: string; kind?: string }[],
): Map<string, string> {
  return assignDisplayTokens(
    replacements
      .filter((r) => r.real)
      .map((r) => ({ value: r.real, placeholder: r.fake, kind: r.kind })),
  );
}
