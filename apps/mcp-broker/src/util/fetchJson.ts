/**
 * Authenticated JSON fetch for platform tools. Adds the bearer, parses JSON, and
 * normalises errors — provider error bodies (which can echo tokens/PII) are NOT
 * forwarded verbatim; only a status + short reason is surfaced.
 */
export function bearerFetchJson(accessToken: string) {
  return async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "openmasq-broker",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      // Read + discard the body so we never leak provider internals to the model.
      await res.text().catch(() => "");
      throw new Error(`Upstream request failed (${res.status})`);
    }
    // AN EMPTY BODY IS AN EMPTY SUCCESS. A write that succeeds often replies with NO body
    // (an empty `202`, a `204`): parsing it as JSON would surface the tool as a FAILURE
    // although the effect took place, and the model would retry — a duplicate write.
    const text = await res.text();
    if (!text.trim()) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      // An unreadable 2xx is still an anomaly, but a NAMED one — not an orphan `SyntaxError`.
      throw new Error(`Upstream returned a non-JSON body (${res.status})`);
    }
  };
}

/** POST application/x-www-form-urlencoded and parse JSON (token endpoints). */
export async function postForm<T>(
  url: string,
  body: Record<string, string>,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...headers },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status})`);
  }
  return (await res.json()) as T;
}
