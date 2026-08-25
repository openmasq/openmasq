/**
 * Resolve the Anthropic Messages endpoint + auth headers for a request, in either
 * mode — shared by the plain-stream (`providers/anthropic.ts`) and agentic-tools
 * (`tools/anthropic.ts`) paths so they never drift.
 *
 * - DIRECT (no `baseUrl`): the user's OWN Anthropic key → `api.anthropic.com/v1/messages`,
 *   authed with `x-api-key` + the version + the browser-origin opt-in.
 * - PLATFORM (`baseUrl` set = the platform's gateway): the request is a keyless member send
 *   proxied on the platform's key. Post to `${baseUrl}/v1/messages` with the Supabase JWT as
 *   `Authorization: Bearer` — the GATEWAY holds the real Anthropic key and adds
 *   `x-api-key` + the version header upstream. We send NO provider key and NO
 *   Anthropic-specific headers (the gateway owns those).
 *
 * The presence of `baseUrl` is the discriminator: direct Anthropic never sets one
 * (it ignores `baseUrl`), so a set `baseUrl` unambiguously means the platform gateway.
 */
export function anthropicEndpoint(
  apiKey: string | undefined,
  baseUrl?: string,
): { url: string; headers: Record<string, string> } {
  if (baseUrl) {
    return {
      url: `${baseUrl.replace(/\/$/, "")}/v1/messages`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey ?? ""}`,
      },
    };
  }
  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey ?? "",
      "anthropic-version": "2023-06-01",
      // Browser-origin opt-in (mobile WebView / any browser); harmless no-op from Node.
      "anthropic-dangerous-direct-browser-access": "true",
    },
  };
}
