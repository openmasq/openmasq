import { MODELS, isFreeModel, type ModelInfo } from "@openmasq/llm";

/** Every selectable model. This is the SAME array reference as the registry's `MODELS`
 *  (not a copy) ON PURPOSE: `setDynamicModels` (the OpenRouter live-catalogue merge)
 *  mutates `MODELS` in place, and aliasing lets the pickers see the update without a
 *  copy going stale. Read-only in practice — never mutate it here. */
export const ALL_MODELS: ModelInfo[] = MODELS;

/**
 * Retired model ids → their current replacement, so a conversation pinned to a
 * removed model keeps working (e.g. Google deleted the Gemini 1.5 series — those
 * ids now 404 on generateContent).
 */
const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "gemini-1.5-pro": "gemini-2.5-pro",
  "gemini-1.5-flash": "gemini-2.5-flash",
  // The Mistral `-latest` aliases were replaced by pinned high-TPM snapshots
  // (same tier/price) — remap so a conversation pinned to the old id keeps its
  // model in the picker.
  "mistral-large-latest": "mistral-large-2512",
  "mistral-medium-latest": "mistral-medium-2508",
  "mistral-small-latest": "mistral-small-2506",
  "ministral-8b-latest": "ministral-8b-2512",
};

/**
 * How a picker DISPLAYS a model: `free` drives the small lime « gratuit » badge
 * (a zero-priced model — costs nothing, never blocked on credits), and the label
 * drops a redundant textual "(gratuit)"/"(free)" suffix when the badge says it.
 * One helper (rule 9) so the chat Finder and the Settings grid can't disagree.
 */
export function modelDisplay(model: ModelInfo): { label: string; free: boolean } {
  const free = isFreeModel(model.id);
  return {
    label: free ? model.label.replace(/\s*\((?:gratuit|free)\)\s*$/i, "") : model.label,
    free,
  };
}

export function findModelAny(id: string): ModelInfo | undefined {
  const resolved = LEGACY_MODEL_ALIASES[id] ?? id;
  return ALL_MODELS.find((m) => m.id === resolved);
}

/**
 * Models offered in the pickers. On a managed account this is an ALLOW-list: only
 * `allowedModelIds` survives, so a model the organisation never opened is not
 * selectable — including one added to the catalogue after the policy was written.
 * They stay resolvable by `findModelAny` (an existing conversation still renders its
 * model name) and the send pipeline hard-blocks them (`ModelBlockedByOrgError`).
 *
 * ⚠️ `undefined` and `[]` mean DIFFERENT things, and reading them the same way is how
 * an allow-list turns back into a deny-list: **absent** = no organisation, everything
 * is offered (a solo user); **empty** = a managed account whose org has opened nothing
 * yet, and NOTHING is offered. So callers pass `orgProfile?.allowedModelIds` straight
 * through — the optional chain IS the distinction, and there is no flag to forget.
 */
export function selectableModels(allowedModelIds?: string[]): ModelInfo[] {
  if (!allowedModelIds) return ALL_MODELS;
  const allowed = new Set(allowedModelIds);
  return ALL_MODELS.filter((m) => allowed.has(m.id));
}

/** Le modèle des nouvelles conversations — Laguna S 2.1 (OpenRouter, gratuit). Gratuit
 *  est la condition, pas une préférence : `send/modelAvailability.ts` ne bloque JAMAIS un
 *  modèle gratuit (« il ne coûte rien en amont »), donc une installation neuve écrit sans
 *  clé et sans abonnement. Repli sur le premier modèle du registre si cet id en disparaît.
 *  ⚠️ Un seul foyer : `state/storePersistence.ts` IMPORTE cette constante au lieu de
 *  réécrire l'id — les deux copies avaient déjà divergé une fois. */
export const DEFAULT_MODEL_ID =
  MODELS.find((m) => m.id === "poolside/laguna-s-2.1:free")?.id ?? MODELS[0].id;

/**
 * Resolve the redaction model id for a provider, fixing the common stale value:
 * the bare "mistral" tag is valid on Ollama but 404s/400s on the hosted Mistral
 * API, where the small model is "mistral-small-latest".
 */
export function resolveRedactModel(provider: string, name?: string): string {
  const n = (name ?? "").trim();
  if (provider === "mistral" && (!n || n === "mistral")) {
    return "mistral-small-latest";
  }
  return n || "mistral";
}
