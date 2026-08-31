import type { Connector, ConnectorToolCtx } from "@openmasq/connectors";
import type {
  JsonObject,
  McpConnection,
  McpTool,
  McpToolCall,
  McpToolResult,
} from "@openmasq/mcp";
import { maskAccountLabel } from "../accountIdentity";
import { assertPublicUrl } from "../../net/net";
import { emitNeedsReconnect, needsReconnect } from "../server/registry";
import { BRAND } from "@openmasq/branding";

/** SSRF floor for authenticated connector fetches (audit M8). The redirect defenses
 *  (`redirect:"error"` on JSON; cross-origin `Authorization` stripping on text) only
 *  cover REDIRECTS — hop 0 was unguarded, so a tool that interpolates a model-supplied
 *  value into the request HOST could reach an internal address AND leak the OAuth bearer
 *  there. Enforce a PUBLIC-host floor on the initial URL — reject localhost/`.local`/
 *  private/CGNAT/link-local/metadata targets (and an unparseable URL) — BEFORE the bearer
 *  is attached. Provider APIs (googleapis.com, api.github.com, graph.microsoft.com…)
 *  resolve public → pass. Wraps `assertPublicUrl` so a resolution error surfaces as a
 *  clear refusal rather than the raw cause. */
async function assertConnectorTarget(url: string): Promise<void> {
  try {
    await assertPublicUrl(url, "connector");
  } catch (e) {
    // A DNS/network outage is not an SSRF refusal: both BLOCK (fail closed),
    // but the label must state the real cause — "unreachable" is a transport class
    // (retryable) on the loop's side, whereas a refusal remains a dead end.
    if ((e as NodeJS.ErrnoException)?.code === "EDNS_UNRESOLVED") {
      throw new Error(`Réseau ou DNS injoignable pour ce connecteur — réessaie dans un instant.`);
    }
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`Requête connecteur bloquée (adresse interne/non publique) : ${reason}`);
  }
}

/**
 * Wrap a `@openmasq/connectors` `Connector` as an `McpConnection` so a
 * desktop-direct connector plugs into the SAME routing (`connected` map,
 * `refreshRoutes`, `mcpCallTool`) and redaction as the SDK-backed servers — the
 * tools just run IN-PROCESS here against a fresh access token (no broker/network).
 */

/**
 * Pull a short, SAFE reason CODE out of a provider error body so a tool can give a
 * precise hint (API-disabled vs scope-missing vs bad-token) instead of a bare
 * status. Google REST errors carry `error.status` (e.g. PERMISSION_DENIED) plus a
 * `reason` token under `errors[]`/`details[]` (e.g. `SERVICE_DISABLED`,
 * `ACCESS_TOKEN_SCOPE_INSUFFICIENT`, `accessNotConfigured`). We surface ONLY those
 * enum-like tokens — NEVER the free-text message, which could echo request data
 * (PII). Bounded + best-effort (a non-JSON body yields nothing). */
function upstreamReason(body: string): string | undefined {
  try {
    const j = JSON.parse(body) as {
      error?: {
        status?: string;
        errors?: { reason?: string }[];
        details?: { reason?: string }[];
      };
    };
    const e = j.error;
    if (!e) return undefined;
    const reason =
      e.errors?.find((x) => x.reason)?.reason ??
      e.details?.find((x) => x.reason)?.reason ??
      e.status;
    // Guard: only pass through a bare enum token (letters/underscores), never a
    // sentence — belt-and-suspenders so no free-text (potential PII) leaks out.
    return reason && /^[A-Za-z_]+$/.test(reason) ? reason : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `Upstream request failed (403): SERVICE_DISABLED` — status + safe reason code, and
 * that is ALL the model or a hint may ever read.
 *
 * `detail` carries the provider's own `error.message` — the one field that says WHAT
 * was wrong ("Missing required parameter: timeMin"). It was previously thrown away, so
 * a 400 reached the user as an unexplainable failure: the app guessed "the model
 * malformed the call", the model guessed "connection problem", and neither could be
 * checked. It is free provider text and MAY quote a real value, so it has exactly one
 * destination — the per-account ENCRYPTED debug journal — and never `content`.
 */
class UpstreamError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
    /** The HTTP STATUS, kept so the caller can ACT on it — a 401 isn't a
     *  failure but a connector STATE (see `callTool`). The message, on the other hand, remains the only
     *  thing the model reads. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

function upstreamError(status: number, body: string, label?: string): UpstreamError {
  // ⚠️ 401 = the provider REFUSES the stored token. It's a state, not a failure: retrying
  // will always fail, and "Upstream request failed (401)" tells nobody what to do —
  // the model could only repeat it, the connection stayed displayed as valid, and the
  // "Retry" button relaunched a turn already lost (observed 15/08 on GitHub).
  // So the SAME actionable message as the "token absent" path is returned: who, where, and
  // the instruction not to loop.
  if (status === 401) {
    return new UpstreamError(
      `Connexion refusée par le fournisseur (401) pour « ${label ?? "ce connecteur"} » — le ` +
        `jeton n'est plus valide. Demande à l'utilisateur de reconnecter ce connecteur ` +
        `(Réglages → Connecteurs). Ne réessaie pas en boucle.`,
      upstreamDetail(body),
      status,
    );
  }
  const reason = upstreamReason(body);
  return new UpstreamError(
    `Upstream request failed (${status})${reason ? `: ${reason}` : ""}`,
    upstreamDetail(body),
    status,
  );
}

/** The provider's human explanation, bounded. Journal-only — see {@link UpstreamError}. */
function upstreamDetail(body: string): string | undefined {
  try {
    const j = JSON.parse(body) as { error?: { message?: unknown } | string };
    const m = typeof j.error === "string" ? j.error : j.error?.message;
    return typeof m === "string" && m.trim() ? m.trim().slice(0, 500) : undefined;
  } catch {
    return body.trim() ? body.trim().slice(0, 500) : undefined;
  }
}

/** Authenticated JSON fetch injected into each tool. Never echoes the provider
 *  body (which can carry PII) — only a status + safe reason CODE on failure. */
export function bearerFetchJson(accessToken: string, label?: string): ConnectorToolCtx["fetchJson"] {
  return async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    await assertConnectorTarget(url); // SSRF floor on hop 0 (audit M8)
    const res = await fetch(url, {
      ...init,
      // SECURITY (audit): never follow a redirect on an authenticated JSON API call —
      // an API endpoint that 30x's cross-origin must not carry the OAuth bearer along
      // (mirrors accountIdentity.callJson). REST APIs answer 2xx/4xx directly.
      redirect: "error",
      headers: {
        // Provider-neutral defaults; a tool overrides via `init.headers` (e.g.
        // GitHub's `application/vnd.github+json`). Bearer + UA always applied.
        Accept: "application/json",
        "User-Agent": BRAND.name,
        ...(init.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      throw upstreamError(res.status, await res.text().catch(() => ""), label);
    }
    // ⚠️ **AN EMPTY BODY IS AN EMPTY SUCCESS, NOT A PARSE ERROR.** A write that
    // succeeds very often answers with NO body — Graph `POST /me/sendMail` returns an empty
    // `202 Accepted`, a `DELETE` returns `204`. `res.json()` used to throw « Unexpected end of JSON input »
    // there, and everything downstream was wrong: the tool reported back as a FAILURE while the mail had
    // actually been sent, the model retried the same call — so a SECOND mail went out — then told
    // the user the send hadn't worked (observed 18/08 on Outlook).
    // A real side effect presented as a failure is worse than a failure: it repeats itself.
    const text = await res.text();
    if (!text.trim()) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      // A 2xx with an unreadable body remains an anomaly — but it's NAMED, instead of letting
      // a `SyntaxError` surface that nobody can connect to what happened.
      throw new UpstreamError(
        `Réponse illisible du fournisseur (${res.status})${label ? ` pour « ${label} »` : ""} : ` +
          `l'appel a abouti mais son contenu n'est pas du JSON.`,
        upstreamDetail(text),
        res.status,
      );
    }
  };
}

/** Authenticated fetch returning the RAW body text (Drive export / alt=media). */
function bearerFetchText(accessToken: string, label?: string): ConnectorToolCtx["fetchText"] {
  return async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
    await assertConnectorTarget(url); // SSRF floor on hop 0 (audit M8)
    // NB: redirects are followed here (unlike fetchJson) — media/export downloads
    // (Drive `alt=media`, signed googleusercontent URLs) legitimately 30x. The fetch
    // runtime strips the `Authorization` header on a CROSS-ORIGIN redirect, so the
    // bearer isn't forwarded off the API host.
    const res = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": BRAND.name,
        ...(init.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      throw upstreamError(res.status, await res.text().catch(() => ""), label);
    }
    return res.text();
  };
}

export function makeConnectorConnection(opts: {
  id: string;
  connector: Connector;
  /** Resolve the current access token (throws if unavailable). */
  getToken: () => Promise<string>;
  /** OAuth scopes actually granted for THIS connection (the connector's scopes for
   *  the active credential mode). A tool declaring a `scope` is only listed when
   *  that scope is present — e.g. Gmail's read tools appear only in "mes clés" mode,
   *  never in the 1-clic send-only mode. */
  grantedScopes: string[];
  /** Multi-account: the account this instance is signed into (email / "Compte N").
   *  Appended to each tool's description so the model can pick the right account
   *  when the same connector is connected with several accounts. */
  accountLabel?: string;
}): McpConnection {
  const { id, connector, getToken, grantedScopes, accountLabel } = opts;
  // The account discriminator the MODEL sees is MASKED (email local-part stripped) —
  // the model must never receive the user's full address, only enough to route.
  const modelLabel = maskAccountLabel(accountLabel);
  return {
    id,
    async listTools(): Promise<McpTool[]> {
      return connector.tools
        .filter((t) => !t.scope || grantedScopes.includes(t.scope))
        .map((t) => ({
          name: t.name,
          description: modelLabel ? `${t.description} (compte : ${modelLabel})` : t.description,
          inputSchema: t.inputSchema as JsonObject,
          serverId: id,
        }));
    },
    async callTool(call: McpToolCall): Promise<McpToolResult> {
      const tool = connector.tools.find((t) => t.name === call.name);
      if (!tool) {
        return { content: [{ type: "text", text: `Unknown tool: ${call.name}` }], isError: true };
      }
      try {
        const accessToken = await getToken();
        const result = await tool.run(call.arguments, {
          accessToken,
          fetchJson: bearerFetchJson(accessToken, connector.name ?? id),
          fetchText: bearerFetchText(accessToken, connector.name ?? id),
        });
        // A call that PASSES proves the token is good again: that's what closes the
        // banner set below. Deliberately self-healing — reconnecting it takes a
        // different path than the remote transport (`connectDirectServer`), and making the
        // banner's dismissal depend on that path would leave it lit on a connector that's
        // become healthy again.
        if (needsReconnect.delete(id)) emitNeedsReconnect();
        return result;
      } catch (err) {
        // The connector's OWN actionable message when it has one — applied HERE so a
        // tool added later cannot forget it (`Connector.errorHint`). `detail` carries
        // the provider's real explanation for the local journal ONLY; it never enters
        // `content`, which is the one thing the model reads.
        // ⚠️ A 401 is a connector STATE, not a call failure: the provider
        // refuses the stored token, so ALL its tools will fail until a reconnection.
        // A DIRECT connector runs in-process — it has no transport to drop,
        // so nothing signaled it: the "reconnexion nécessaire" banner only
        // lifted for REMOTE connectors, and the user here only saw a
        // tool failing, connector displayed green (observed 15/08 on GitHub). So it's
        // flagged at the source. 401 ALONE: a 403 is a missing right or scope, and
        // asking for a reconnection over that would send the user through a pointless round trip.
        if (err instanceof UpstreamError && err.status === 401 && !needsReconnect.has(id)) {
          needsReconnect.add(id);
          emitNeedsReconnect();
        }
        const raw = err instanceof Error ? err.message : String(err);
        const text = connector.errorHint?.(err) ?? raw;
        const detail = err instanceof UpstreamError ? err.detail : undefined;
        return { content: [{ type: "text", text }], isError: true, ...(detail ? { detail } : {}) };
      }
    },
    async close(): Promise<void> {
      /* nothing to tear down — no socket/process */
    },
  };
}
