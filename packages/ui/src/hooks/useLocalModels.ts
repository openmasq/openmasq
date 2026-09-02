import { findModel, setDynamicModels, type DynamicModel } from "@openmasq/llm";
import type { Host } from "../host";

/**
 * The LIVE model list of the user's own `openai-compat` server, merged over the static
 * Ollama baseline — the local counterpart of `useOpenRouterModels`, driven by the
 * reachability probe (`useLocalEndpointProbe`: same address, same trigger — mount,
 * address change, window focus) rather than by a hook of its own.
 *
 * What replaces the baseline: the ids the server's `/models` answers (Ollama, LM Studio,
 * llama.cpp, vLLM all serve it) PLUS the ids typed in Réglages → Modèles
 * (`Settings.openaiCompatModelIds`) — typed ids first, so a model the server hides until
 * it is loaded is still one click away. Label = the id, marked « (local) » like the
 * baseline, so a picker row reads the same whichever source it came from.
 *
 * DEGRADE, never fail: no slot, a throw, or an EMPTY union leaves the current group as
 * it is (the baseline, or the previous fetch) — a transient hiccup never empties the
 * picker. A server that has genuinely NO model shows the baseline, and the send then
 * fails with the server's own 404, which is the truthful outcome.
 */
const MAX_TYPED = 50;
const MAX_ID_LEN = 200;

/** Free text → ids: commas, whitespace or newlines separate; de-duplicated, bounded. */
export function parseLocalModelIds(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const id = raw.trim();
    if (!id || id.length > MAX_ID_LEN || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= MAX_TYPED) break;
  }
  return out;
}

/** Pure: typed ids + served ids → the picker's group, typed first, no duplicate. */
export function localModelList(typed: readonly string[], served: readonly string[]): DynamicModel[] {
  const seen = new Set<string>();
  const out: DynamicModel[] = [];
  for (const id of [...typed, ...served]) {
    if (seen.has(id)) continue;
    seen.add(id);
    // A served id the registry knows keeps its readable label (« Llama 3.3 (local) »);
    // an unknown one is shown by its id, marked local.
    const known = findModel(id);
    const label = known?.provider === "openai-compat" ? known.label : `${id} (local)`;
    out.push({ id, label, provider: "openai-compat", pricing: { in: 0, out: 0 } });
  }
  return out;
}

/**
 * Ask the host for the server's ids and fold them into the registry. Resolves with the
 * number of models applied (0 = nothing changed). Never rejects.
 */
export async function refreshLocalModels(host: Host, baseUrl: string, typedIds: string): Promise<number> {
  const typed = parseLocalModelIds(typedIds);
  let served: string[] = [];
  const list = host.models?.listLocal;
  if (list) {
    try {
      served = (await list.call(host.models, baseUrl)) ?? [];
    } catch {
      served = [];
    }
  }
  const models = localModelList(typed, served);
  if (!models.length) return 0;
  return setDynamicModels("openai-compat", models);
}
