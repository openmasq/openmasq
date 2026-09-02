/**
 * Generate embeddings via any OpenAI-compatible `/embeddings` endpoint:
 * OpenAI, Mistral, or a local server (Ollama at /v1/embeddings). Runs in the
 * main process (Node) — no CORS, key stays out of the renderer.
 */

import { assertPublicUrl, pinnedDispatcher } from "./net/net";

export interface EmbedConfig {
  model: string;
  baseUrl: string;
  apiKey?: string;
}

/** localhost / 127.x / ::1 — the documented LOCAL embeddings path (Ollama / LM Studio). */
function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(h)
  );
}

/**
 * SSRF guard for the renderer-supplied embeddings `baseUrl` (audit M2). `embed()` runs in
 * the privileged MAIN process, OUTSIDE the renderer CSP, so a renderer XSS could otherwise
 * point `baseUrl` at an internal/LAN/cloud-metadata host and exfiltrate the conversation +
 * vault text being embedded (or probe internal services). We ALLOW-list:
 *   • a LOOPBACK origin — the documented local Ollama/LM Studio endpoint (`assertPublicUrl`
 *     would reject it), and
 *   • any PUBLIC host — the feature legitimately supports arbitrary OpenAI-compatible
 *     endpoints (OpenAI/Mistral/self-hosted), so we can't hard-list vendor hosts; instead we
 *     require the host to resolve PUBLIC, which blocks the internal-SSRF vector.
 * Everything else (private/internal address, non-http(s) scheme, malformed URL) is REFUSED
 * (fail-closed). Returns the VERIFIED public addresses (or `null` for a loopback host) so
 * `embed` can PIN the connection to them — closing the DNS-rebinding TOCTOU the raw `fetch`
 * left open (a public host re-resolving to an internal IP between the check and the POST).
 */
export async function assertEmbeddingsEndpoint(baseUrl: string): Promise<string[] | null> {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new Error("Embeddings baseUrl is not a valid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Refused non-http(s) embeddings endpoint: ${u.protocol}`);
  }
  if (isLoopbackHost(u.hostname)) return null; // localhost Ollama — no rebind surface
  return await assertPublicUrl(u.toString(), "embeddings"); // throws on a private/internal host
}


export async function embed(
  inputs: string[],
  cfg: EmbedConfig,
): Promise<number[][]> {
  const verified = await assertEmbeddingsEndpoint(cfg.baseUrl);
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/embeddings`;
  // Pin the POST to the verified public IP(s) so a public host can't re-resolve to an
  // internal address between the SSRF check and the request (DNS-rebinding). Loopback
  // (`verified === null`) needs no pin. undici-unavailable ⇒ `undefined` → plain fetch,
  // still `assertPublicUrl`-checked above.
  const dispatcher = verified ? await pinnedDispatcher(verified) : undefined;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: cfg.model, input: inputs }),
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit);
    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`Embeddings API ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json: any = await res.json();
    return (json.data ?? []).map((d: any) => d.embedding as number[]);
  } finally {
    await dispatcher?.close?.().catch(() => {});
  }
}
