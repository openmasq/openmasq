import type { DynamicModel } from "./dynamic.js";

/**
 * OpenRouter's public `/api/v1/models` catalogue → the minimal {@link DynamicModel}
 * shape, PURE (no fetch — each caller owns its own hardened egress).
 *
 * ⚠️ It lives here, not next to a caller, because BOTH sides of the platform boundary
 * consume it and MUST agree (rule 9): the desktop merges it into the picker's registry
 * (`setDynamicModels`), and `apps/gateway` merges the SAME shape to decide what its
 * OpenRouter key may serve AND at what price. A second normalizer would let the two
 * disagree about which slugs exist or what they cost — i.e. about money.
 *
 * Data only — strings + numbers, never code — so a hostile catalogue entry is inert
 * text downstream.
 */
interface OrApiModel {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  architecture?: { input_modalities?: unknown; output_modalities?: unknown };
  pricing?: { prompt?: unknown; completion?: unknown };
  /** The catalogue's declared request parameters — `"tools"` present ⇔ the model does
   *  function calling. Absent list ⇒ unknown (the normalizer leaves `tools` unset). */
  supported_parameters?: unknown;
}

/** Strip OpenRouter's "Vendor: " display prefix and localise the free-tier suffix, so
 *  a row reads "Nemotron 3 Ultra (gratuit)" rather than "NVIDIA: Nemotron 3 Ultra (free)". */
function cleanLabel(name: string, id: string): string {
  let label = name.includes(":") ? name.slice(name.indexOf(":") + 1).trim() : name.trim();
  label = label.replace(/\s*\(free\)\s*$/i, "").trim();
  if (id.endsWith(":free")) label += " (gratuit)";
  return label || id;
}

/**
 * A BATCH variant? Two markers, and we refuse as soon as ONE speaks up.
 *
 * The ID carries the variant suffix (`anthropic/claude-opus-5:batch`) — that's the
 * structural form, the one OpenRouter routes on. The NAME carries "(batch)", that's what a
 * human reads. The two coincide today across the catalogue's 61 entries; reading BOTH
 * avoids a rename on one side reopening the door on the other — and the suffix alone
 * would have let through a variant named "(batch)" with no id marker.
 */
function isBatchVariant(id: string, name: string): boolean {
  return /:batch$/i.test(id) || /\(\s*batch\s*\)/i.test(name);
}

function asStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** USD per 1M tokens from OpenRouter's per-token string price ("0.0000002" → 0.2). */
function perMillion(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 1e6 * 1000) / 1000 : 0;
}

/** Normalize the raw catalogue to chat models only, sorted cheapest→dearest (free first). */
export function normalizeOpenRouterModels(raw: unknown): DynamicModel[] {
  const data = (raw as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("OpenRouter models: unexpected shape");
  const out: (DynamicModel & { _sort: number })[] = [];
  for (const m of data as OrApiModel[]) {
    const id = typeof m.id === "string" ? m.id : "";
    if (!id) continue;
    // Drop OpenRouter's META-ROUTERS (`openrouter/auto`, `openrouter/free`, `…/fusion`):
    // they route opaquely to other models, so their price/context is meaningless in a
    // picker — and, on the gateway, a price we cannot charge for what actually ran.
    if (id.startsWith("openrouter/")) continue;
    // Drop the BATCH variants (`…:batch`, labeled "… (batch)"): 61 of the catalogue's 412
    // entries on 18/08. These are the same models served by OpenRouter's DEFERRED queue
    // — the reply arrives hours later, not in the stream. A chat app can do nothing with
    // them: the picker would offer twice the entries for a half that never answers on
    // screen. We cut HERE rather than in the picker so the gateway doesn't keep a price
    // for them either (it reads the SAME normalization, that's the whole point of this
    // file): servable and selectable stay the same list.
    if (isBatchVariant(id, typeof m.name === "string" ? m.name : "")) continue;
    const input = asStrArray(m.architecture?.input_modalities);
    const output = asStrArray(m.architecture?.output_modalities);
    // TEXT-GENERATION chat models only: must take text in, and produce text and NOTHING
    // else — an `audio`/`image`/`video` output means a music/image-gen model (e.g. Lyria
    // declares `["text","audio"]`), which is not a chat model even though it lists text.
    const media = output.includes("audio") || output.includes("image") || output.includes("video");
    if (!input.includes("text") || !output.includes("text") || media) continue;
    const inPrice = perMillion(m.pricing?.prompt);
    const outPrice = perMillion(m.pricing?.completion);
    out.push({
      id,
      label: cleanLabel(typeof m.name === "string" ? m.name : id, id),
      provider: "openrouter",
      vision: input.includes("image") || undefined,
      contextTokens: typeof m.context_length === "number" ? m.context_length : undefined,
      pricing: { in: inPrice, out: outPrice },
      // `false` marks a model that 400s on a `tools` request (Gemma tiers) — the agent
      // loop then degrades to a plain stream. Unknown (no list) stays undefined.
      tools: Array.isArray(m.supported_parameters)
        ? asStrArray(m.supported_parameters).includes("tools")
        : undefined,
      _sort: inPrice + outPrice,
    });
  }
  out.sort((a, b) => a._sort - b._sort || a.label.localeCompare(b.label));
  return out.map(({ _sort, ...m }) => m);
}
