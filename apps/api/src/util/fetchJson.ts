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
    // ⚠️ **UN CORPS VIDE EST UN SUCCÈS VIDE.** Une écriture qui aboutit répond souvent SANS
    // corps (Graph `sendMail` → `202` vide, un `DELETE` → `204`) : `res.json()` y jetait
    // « Unexpected end of JSON input », l'outil remontait en ÉCHEC alors que l'effet avait
    // eu lieu, et le modèle rejouait — donc un doublon (constaté le 18/08 sur Outlook, côté
    // desktop). Le même correctif vit dans `apps/desktop/.../connectors/run.ts` : deux
    // runtimes, donc deux copies, mais la même règle — les faire diverger rouvrirait le
    // défaut du côté resté en arrière.
    const text = await res.text();
    if (!text.trim()) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      // Un 2xx illisible reste une anomalie, mais NOMMÉE — pas un `SyntaxError` orphelin.
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
