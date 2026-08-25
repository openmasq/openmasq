/**
 * Model id → CANONICAL vendor identity. The single source (root rule 9) for folding a
 * vendor's many spellings into one identity, shared by the model pickers' family logic
 * (`prompt/modelFilter.ts`) and the logo resolver (`components/media/ModelLogo`). Pure,
 * no deps, no React — it lives in `prompt/` (the brain tier) so BOTH `pages/` and
 * `components/` may import it without an up-tree dependency.
 */

/** Raw vendor slug → canonical key. OpenRouter ships several spellings of the same
 *  vendor: the `mistralai`/`meta-llama`/`x-ai` variants of a native provider, and a
 *  `~vendor` self-moderated endpoint (`~anthropic`, `~openai`…) that must fold into
 *  the base vendor. The leading `~` is stripped BEFORE this lookup. */
const VENDOR_ALIASES: Record<string, string> = {
  mistralai: "mistral",
  "meta-llama": "meta",
  "x-ai": "xai",
  "google-vertex": "google",
  moonshotai: "moonshot",
  "bytedance-seed": "bytedance",
  nousresearch: "nous",
};

/** A vendor NAME substring (in a model name/id, prefix stripped) → its canonical family
 *  key. For a PLATFORM-hosted model the id carries the gateway, not the vendor (Scaleway
 *  has no prefix), so the vendor is read
 *  from the name. ⚠️ The NEEDLE set MUST match the logo resolver's own name table
 *  (`ModelLogo/glyphKeys.ts` `MODEL_VENDOR`) so a card's logo and its family header agree
 *  — pinned by `vendorKey.test.ts` (parity). */
const NAME_VENDORS: ReadonlyArray<readonly [string, string]> = [
  ["deepseek", "deepseek"],
  ["kimi", "moonshot"],
  ["minimax", "minimax"],
  ["grok", "xai"],
  ["nemotron", "nvidia"],
  ["qwen", "qwen"],
  ["gemma", "google"],
  ["glm", "z-ai"],
  ["mistral", "mistral"],
];

/** The `vendor/…` prefix of a namespaced id (OpenRouter), lower-cased, or
 *  null when the id carries none (a native provider's bare id). */
export function vendorPrefix(id: string): string | null {
  return id.includes("/") ? id.slice(0, id.indexOf("/")).toLowerCase() : null;
}

/** Fold a raw vendor slug to its canonical family key (strip a `~` endpoint prefix,
 *  then apply the alias table). */
export function canonicalVendorKey(raw: string): string {
  const bare = raw.startsWith("~") ? raw.slice(1) : raw;
  return VENDOR_ALIASES[bare] ?? bare;
}

/** The canonical family read from a model NAME (its recognised vendor substring), or
 *  null when unrecognised. A `vendor/…` prefix is stripped before matching. */
export function vendorFromName(id: string): string | null {
  const wire = id.slice(id.indexOf("/") + 1).toLowerCase();
  for (const [needle, key] of NAME_VENDORS) if (wire.includes(needle)) return key;
  return null;
}

/** The name needles, exported so the logo table can be checked for parity (rule 9). */
export const NAME_VENDOR_NEEDLES: readonly string[] = NAME_VENDORS.map(([n]) => n);
