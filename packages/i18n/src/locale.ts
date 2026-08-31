/**
 * The LANGUAGE: the union of locales, the catalogue per language, and the resolution of an
 * arbitrary string (`app.getLocale()` → « fr-FR », `navigator.language` → « en-GB »)
 * to a locale the app knows. Pure, no React, no I/O — importable by the
 * renderer, by `main`, by `emails`, by the backend.
 *
 * ## Adding a language
 *
 * A new `xx.ts` that `satisfies Messages`, its key added to `Locale` AND to `MESSAGES`.
 * The compiler then demands every key of the contract (`messages.ts`): the door is
 * open, and an incomplete language does not compile. `LOCALES` derives from it, so everything
 * that iterates the languages (a picker, a completeness test) sees them all with no
 * second list (rule 9).
 */
import type { Messages } from "./messages";
import { fr } from "./fr";
import { en } from "./en";

/** The shipped languages. Extending = adding a member here AND an entry to `MESSAGES`. */
export type Locale = "fr" | "en";

/** The catalogue per language — the ONLY table. `LOCALES` and `getMessages` derive from it, so
 *  a language added here is everywhere at once. */
export const MESSAGES: Record<Locale, Messages> = { fr, en };

/** Every shipped locale, in display order (source = French). */
export const LOCALES = Object.keys(MESSAGES) as Locale[];

/** The default language: French, the product's source language. It is also the ultimate
 *  fallback when nothing could be resolved (fail-safe, never a blank screen). */
export const DEFAULT_LOCALE: Locale = "fr";

/** True if `x` is a shipped locale. */
export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as string[]).includes(x);
}

/**
 * Reduces an arbitrary language tag to a shipped locale, or `null` if none
 * matches (the caller then picks its fallback — often `DEFAULT_LOCALE`). We read the
 * primary SUBTAG (« en-GB » → « en », « fr_CA » → « fr »), case-insensitive,
 * tolerant of `_` as of `-`. `null` rather than a hidden default: the fallback is
 * the caller's decision, not this function's silence.
 */
export function resolveLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const primary = tag.toLowerCase().replace(/_/g, "-").split("-")[0];
  return isLocale(primary) ? primary : null;
}

/** A locale's catalogue. A locale outside the union falls back to the default (fail-safe). */
export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
}
