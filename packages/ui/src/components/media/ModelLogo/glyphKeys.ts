import type { ProviderId } from "@openmasq/llm";

/* ───────────────────────── model logo resolution ─────────────────────────
   A model's mark is resolved in two steps: first by the model's own id (so a
   platform gateway like OpenRouter / Scaleway shows each model's REAL vendor
   logo — DeepSeek, Kimi, Qwen…), then, when the id matches no known vendor, by
   the provider. redact's pearl stands in for genuinely unknown / local models.
   Vendors this hand-inlined set doesn't cover are picked up downstream by
   `familyBrands.ts` (simple-icons) then `vendorLogoImages.ts` (vendored icons). */

export type GlyphKey =
  | "claude"
  | "chatgpt"
  | "gemini"
  | "mistral"
  | "deepseek"
  | "grok"
  | "kimi"
  | "minimax"
  | "qwen"
  | "gemma"
  | "glm"
  | "nvidia"
  | "pearl";

/** Map a openmasq provider id to the brand glyph that represents it. */
export function glyphForProvider(provider: ProviderId): GlyphKey {
  switch (provider) {
    case "anthropic":
    case "anthropic-session":
      return "claude";
    case "openai":
    case "openai-session":
      return "chatgpt";
    case "google":
      return "gemini";
    case "mistral":
      return "mistral";
    default:
      // String-keyed so future "deepseek"/"grok"/"xai" providers map even before
      // they're added to the ProviderId union.
      if ((provider as string) === "deepseek") return "deepseek";
      if ((provider as string) === "grok" || (provider as string) === "xai") return "grok";
      return "pearl"; // openai-compat / local / unknown
  }
}

/** Substring rules matched against the (prefix-stripped, lower-cased) model id.
 *  Order matters only where one token could contain another — none here do. */
const MODEL_VENDOR: ReadonlyArray<readonly [string, GlyphKey]> = [
  ["deepseek", "deepseek"],
  ["kimi", "kimi"],
  ["minimax", "minimax"],
  ["grok", "grok"],
  ["nemotron", "nvidia"],
  ["qwen", "qwen"],
  ["gemma", "gemma"],
  ["glm", "glm"],
  ["mistral", "mistral"],
];

/** Resolve a model id to its real vendor glyph, or null when none is known. A
 *  namespacing `vendor/…` prefix is stripped before matching. */
export function glyphForModel(modelId: string): GlyphKey | null {
  const wire = modelId.slice(modelId.indexOf("/") + 1).toLowerCase();
  for (const [needle, key] of MODEL_VENDOR) if (wire.includes(needle)) return key;
  return null;
}

/** The vendor glyph for a CANONICAL model-family key (the default-model picker's
 *  family chips — `prompt/modelFilter.ts` `modelFamily`). Returns null for
 *  a vendor we hold no mark for, so the chip falls back to a letter monogram.
 *  Note the keys are FAMILY keys (already folded: `mistralai`→`mistral`,
 *  `x-ai`→`xai`, `moonshotai`→`moonshot`), NOT raw OpenRouter slugs. */
export function glyphForFamily(key: string): GlyphKey | null {
  switch (key) {
    case "openai":
      return "chatgpt";
    case "anthropic":
      return "claude";
    case "google":
      return "gemini";
    case "mistral":
      return "mistral";
    case "deepseek":
      return "deepseek";
    case "qwen":
      return "qwen";
    case "xai":
      return "grok";
    case "nvidia":
      return "nvidia";
    case "minimax":
      return "minimax";
    case "moonshot": // Moonshot AI ships the Kimi models
      return "kimi";
    case "z-ai": // Z.AI (Zhipu) ships the GLM models
      return "glm";
    default:
      return null;
  }
}

export const TILE_BG: Record<GlyphKey, string> = {
  claude: "#F7F3EE",
  chatgpt: "#E9F6F1",
  gemini: "#EAF0FE",
  mistral: "#1a1814",
  deepseek: "#EAEEFF",
  grok: "#1a1814",
  kimi: "#12233D", // white "K" + blue accent → needs a dark tile to read
  minimax: "#FDECEF",
  qwen: "#EFEBFF",
  gemma: "#EAF0FF",
  glm: "#ECEBFF",
  nvidia: "#F1F7E9", // white frame on near-black, per the vendor mark
  pearl: "var(--surface-sunken)",
};

/** The plate behind a vendored icon drawn as dark ink on transparency (IBM, Liquid,
 *  Writer…). Theme-INDEPENDENT like the pastels above: the mark is a fixed-colour
 *  brand asset, so its backing must not follow the dark theme or the ink disappears. */
export const PLATE_BG = "#F4F2EE";
