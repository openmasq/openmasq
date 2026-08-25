import { normalizeOpenRouterModels, type DynamicModel } from "@openmasq/llm";
import { safeFetch } from "./net";

// The NORMALIZER moved to `@openmasq/llm` (`models/openrouterCatalog.ts`): the gateway
// needs the exact same mapping to decide what its OpenRouter key may serve and at what
// price, and two copies of that would be two opinions about money (rule 9). Re-exported
// here so this module stays the desktop's single import site for the catalogue.
export { normalizeOpenRouterModels };

/**
 * OpenRouter's LIVE model catalogue (`models:list-openrouter`).
 *
 * OpenRouter's `/api/v1/models` is a PUBLIC, self-describing endpoint (id + pricing +
 * context window + modalities, NO key). We fetch it in MAIN — the URL is a FIXED
 * first-party constant (no renderer input → no SSRF) over the hardened `safeFetch`
 * egress path (http(s), IP-pinned, size/timeout capped, `application/json` allow-listed)
 * — normalize to the minimal {@link DynamicModel} shape, and hand it to the renderer,
 * which merges it over the static registry (`setDynamicModels`).
 *
 * FAIL-CLOSED / DEGRADE: any error (network, non-JSON, bad shape) throws; the renderer
 * catches it and keeps the hard-coded OpenRouter baseline. We return DATA only (strings
 * + numbers), never code, so a hostile catalogue entry is just inert text downstream.
 */
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export async function fetchOpenRouterModels(): Promise<DynamicModel[]> {
  const res = await safeFetch(OPENROUTER_MODELS_URL, {
    source: "model-catalogue",
    timeoutMs: 8000,
    maxBytes: 8_000_000,
    accept: "text", // TEXT_CONTENT_TYPES includes application/json
    allowHosts: ["openrouter.ai"],
  });
  return normalizeOpenRouterModels(JSON.parse(res.buf.toString("utf8")));
}
