// The engine, bound to the proxy's settings. One vault per request (or per session): the
// SAME vault masks every message of the request and restores its reply, so a value gets the
// same fake in the system prompt, the history and the answer.
import {
  pseudonymize,
  redactionCategory,
  unredactArgs,
  unredactReply,
  type RedactionMatch,
  type Vault,
} from "@openmasq/redact";
import {
  categoriesForLevel,
  disabledKindsOf,
  type RedactionLevel,
  usesLocalModel,
} from "@openmasq/catalog";
import type { DetectLocal } from "./ner.js";

export type { Vault };

export interface MaskOutcome {
  text: string;
  matches: RedactionMatch[];
}

export interface Masker {
  /** Mask `text` into `vault` (mutated in place). */
  /** `key` (hex, 32 bytes) makes every fake an HMAC under it — the vault's own key. */
  mask(text: string, vault: Vault, mode: "fake" | "token", key?: string): Promise<MaskOutcome>;
  /** Restore a model REPLY for the caller's eyes (also repairs a fake the model mutated). */
  restoreReply(text: string, vault: Vault): string;
  /** Restore tool-call ARGUMENTS the caller will execute — the outside gets the REAL value,
   *  URL-encoded forms included (rule 11). */
  restoreArgs(text: string, vault: Vault): string;
}

/**
 * The vendors' own vocabulary, kept in clear whatever the level. A coding agent's system
 * prompt names its maker and its model on every call; the on-device model reads « Claude »
 * as a first name and « Anthropic » as a company. None of these is anybody's data. `keep`
 * matches the WHOLE value, so « Claude Dupont » is still a person; only the bare word passes,
 * which is the residual this accepts.
 */
export const VENDOR_TERMS: readonly string[] = [
  "Anthropic",
  "Claude",
  "Claude Code",
  "OpenAI",
  "ChatGPT",
  "Codex",
  "GPT",
  "Google",
  "Gemini",
  "Gemini CLI",
  "GitHub",
  "Copilot",
  "GitHub Copilot",
  // …and their handle forms, which the username detector reads as somebody's (`@anthropic`
  // in a package name or a trailer).
  "@anthropic",
  "@anthropic-ai",
  "@openai",
  "@google",
  "@github",
];

export interface MaskerOptions {
  /** The on-device NER; absent ⇒ pattern rules only (the explicit `--rules-only`). */
  detectLocal?: DetectLocal;
  /** The level in force — read per request, so the `l` key re-points it. It decides the
   *  NOTORIETY dispensation: `renforce` spares famous brands and public figures (world
   *  knowledge, never the user's data), `strict` spares nothing. Absent ⇒ the engine's own
   *  defaults (brands redacted, people spared). */
  level?: RedactionLevel;
  keep: string[];
  /** Kinds left in clear: what the level leaves off, plus `--disable`. */
  disabledKinds: string[];
  /** Always masked, whatever the detectors find (the app's Vault): `{ value, category }`. */
  forced: { value: string; category: string }[];
  /** Exact strings always erased. */
  secrets: string[];
}

/** The kinds a level + explicit disables leave in clear — the level arithmetic is the catalogue's. */
export function disabledKindsFor(level: RedactionLevel, extra: string[]): string[] {
  return [...new Set([...disabledKindsOf(categoriesForLevel(level)), ...extra])];
}

/**
 * Does this level still ask for a category only the on-device model finds? `standard` is pure
 * pattern matching, so the proxy starts without loading a model at all; `renforce` and
 * `strict` need it, and refusing to start without it is the fail-closed rule.
 */
export function levelNeedsModel(level: RedactionLevel, extra: string[]): boolean {
  const effective = categoriesForLevel(level);
  for (const kind of extra) effective[kind as keyof typeof effective] = false;
  return usesLocalModel(effective);
}

export function createMasker(opts: MaskerOptions): Masker {
  return {
    async mask(text, vault, mode, key) {
      if (!text) return { text, matches: [] };
      const res = await pseudonymize(text, {
        vault,
        mode,
        key,
        detectLocal: opts.detectLocal,
        keep: [...opts.keep, ...VENDOR_TERMS],
        ...(opts.level
          ? {
              commercialNotoriety: opts.level !== "strict",
              peopleNotoriety: opts.level !== "strict",
            }
          : {}),
        disabledKinds: opts.disabledKinds,
        forced: opts.forced,
        secrets: opts.secrets,
        numbers: false,
      });
      // The engine does not throw when a detector fails: it records `modelError` and carries
      // on with the pattern rules alone. Here that is a refusal — names, companies and places
      // would leave in clear — so it becomes the 502 the app answers (`app.ts`), and the text
      // is not forwarded. The message names the failure, never the text.
      if (res.modelError)
        throw Object.assign(new Error("masking failed: the on-device detector did not run"), {
          status: 502,
        });
      return { text: res.text, matches: res.matches as RedactionMatch[] };
    },
    restoreReply: (text, vault) => (text ? unredactReply(text, vault) : text),
    restoreArgs: (text, vault) => (text ? unredactArgs(text, vault) : text),
  };
}

/** Category → count, for the audit line. Never a value. */
export function tally(matches: RedactionMatch[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of matches) {
    // Normalise to the engine's category BEFORE counting: the raw labels of two detectors can
    // fold onto one (ORG and COMPANY).
    const k = redactionCategory(m.category ?? m.type).toUpperCase();
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
