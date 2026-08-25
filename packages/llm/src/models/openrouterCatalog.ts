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
 * Une variante BATCH ? Deux marqueurs, et on refuse dès que l'UN parle.
 *
 * L'ID porte le suffixe de variante (`anthropic/claude-opus-5:batch`) — c'est la forme
 * structurelle, celle qu'OpenRouter route. Le NOM porte « (batch) », c'est ce qu'un humain
 * lit. Les deux coïncident aujourd'hui sur les 61 entrées du catalogue ; lire les DEUX
 * évite qu'un renommage d'un côté rouvre la porte de l'autre — et le suffixe seul aurait
 * laissé passer une variante nommée « (batch) » sans marqueur d'id.
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
    // Drop the BATCH variants (`…:batch`, libellés « … (batch) ») : 61 des 412 entrées du
    // catalogue au 18/08. Ce sont les mêmes modèles servis par la file DIFFÉRÉE d'OpenRouter
    // — la réponse arrive dans les heures qui suivent, pas dans le flux. Une app de chat ne
    // peut rien en faire : le sélecteur en offrirait le double d'entrées pour une moitié qui
    // ne répond jamais à l'écran. On coupe ICI plutôt que dans le sélecteur pour que la
    // passerelle n'en garde pas un prix (elle lit la MÊME normalisation, c'est tout l'objet
    // de ce fichier) : servable et sélectionnable restent la même liste.
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
