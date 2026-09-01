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
    // ⚠️ **AN EMPTY BODY IS AN EMPTY SUCCESS.** A write that succeeds often replies with NO
    // body (Graph `sendMail` → empty `202`, a `DELETE` → `204`): `res.json()` used to throw
    // "Unexpected end of JSON input" there, the tool surfaced as a FAILURE even though the effect had
    // taken place, and the model retried — hence a duplicate (observed on 18/08 on Outlook, on the
    // desktop side). The same fix lives in `apps/desktop/.../connectors/run.ts`: two
    // runtimes, so two copies, but the same rule — letting them drift would reopen the
    // bug on whichever side was left behind.
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
