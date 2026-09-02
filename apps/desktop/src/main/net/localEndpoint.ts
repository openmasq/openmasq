/**
 * The user's OWN OpenAI-compatible server (`openai-compat`: Ollama, LM Studio, a LAN
 * box) — the two read-only questions the picker asks it, in MAIN because the renderer's
 * CSP can't reach it: « are you up? » (`chat:probe-endpoint`) and « which models do you
 * serve? » (`models:list-local`).
 *
 * Host gate, ONE for both: a LAN/loopback endpoint (`isLanEndpoint` — loopback, RFC1918,
 * `.local`, IPv6 ULA; NEVER link-local, where cloud metadata lives) is contacted as
 * configured; anything else must resolve PUBLIC (`assertPublicUrl`). The send itself
 * (`providerEndpoint.ts`) already reaches a LAN box for this provider, so a probe that
 * refused it greyed out a model the send would have served — the probe is never
 * stricter than the send, and never looser: a renderer XSS learns nothing here it could
 * not learn by sending. `embed()` keeps its own, stricter gate (it POSTs real text).
 *
 * Never throws to the caller of the probe (best-effort UX); the listing throws and its
 * IPC returns [] — the renderer keeps its static baseline either way (DEGRADE).
 */
import { isLanEndpoint } from "./providerHostPolicy";
import { assertPublicUrl } from "./net";

const MAX_IDS = 200;
const MAX_ID_LEN = 200;
const MAX_BODY = 2_000_000;

/** Validates the URL and its host; returns the `/models` URL. Throws on refusal. */
async function modelsUrl(baseUrl: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new Error("Endpoint local : URL invalide.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Endpoint local refusé : ${u.protocol}`);
  }
  if (!isLanEndpoint(baseUrl)) await assertPublicUrl(u.toString(), "local-endpoint");
  return `${baseUrl.replace(/\/$/, "")}/models`;
}

/**
 * `true` if the server ANSWERS at all (any HTTP status ⇒ it's up, an auth-walled 401
 * included), `false` on a refused endpoint, network error or timeout.
 */
export async function probeEndpoint(baseUrl: string, timeoutMs = 2500): Promise<boolean> {
  let url: string;
  try {
    url = await modelsUrl(baseUrl);
  } catch {
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { method: "GET", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Pure: an OpenAI-style `{data:[{id}]}` body → bounded, de-duplicated ids. */
export function parseModelIds(body: unknown): string[] {
  const list = (body as { data?: unknown })?.data;
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of list) {
    const id = (m as { id?: unknown })?.id;
    if (typeof id !== "string") continue;
    const clean = id.trim();
    if (!clean || clean.length > MAX_ID_LEN || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= MAX_IDS) break;
  }
  return out;
}

/**
 * The ids the server serves (`GET /models`), in the server's order. Throws on refusal,
 * timeout, non-200, oversize or non-JSON — the IPC turns that into [].
 */
export async function listEndpointModels(baseUrl: string, timeoutMs = 4000): Promise<string[]> {
  const url = await modelsUrl(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    if (!res.ok) throw new Error(`Endpoint local : /models a répondu ${res.status}.`);
    const len = Number(res.headers.get("content-length")) || 0;
    if (len > MAX_BODY) throw new Error("Endpoint local : liste de modèles trop volumineuse.");
    const text = await res.text();
    if (text.length > MAX_BODY) throw new Error("Endpoint local : liste de modèles trop volumineuse.");
    return parseModelIds(JSON.parse(text));
  } finally {
    clearTimeout(timer);
  }
}
