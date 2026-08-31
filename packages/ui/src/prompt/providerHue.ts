import type { ProviderId } from "@openmasq/llm";

/**
 * Provider → palette hue (`var(--hl-<hue>)`).
 *
 * This fact serves TWO surfaces: the desktop's Usage screen (`pages/Settings/billing/usageHue.ts`)
 * and the web admin console, whose Overview stacks its bars by model. It lives
 * here, exported by the barrel, rather than as two tables that diverge the day a
 * provider is added — a model would then carry one color on one screen and another
 * elsewhere, which nobody reads as a bug until the two are put side by side.
 *
 * Deterministic and total: whatever isn't listed falls back to violet, never a
 * randomly drawn color (two unknown providers must look alike, not lie about
 * a distinction that doesn't exist).
 */
const PROVIDER_HUE: Partial<Record<ProviderId, string>> = {
  anthropic: "pink",
  "anthropic-session": "pink",
  "claude-cli": "pink",

  openai: "mint",
  "codex-cli": "mint",
  "openai-session": "mint",
  "openai-compat": "mint",
  google: "sky",
  mistral: "amber",
  // teal, NOT lime: lime is the BRAND accent, not a hue of the redaction
  // palette — it doesn't even have a `--ink-on-hl-lime` on the console side. A data
  // color that can't say which ink sits on top of it isn't usable as
  // one; the kit made the same call on its own side.
  scaleway: "teal",
};

/** Hue name for a provider — to compose into `var(--hl-<hue>)`. */
export const hueForProvider = (p?: ProviderId | string | null): string =>
  (p && PROVIDER_HUE[p as ProviderId]) || "violet";
