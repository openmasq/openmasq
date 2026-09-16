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

/** SSRF floor on hop 0 of an authenticated connector fetch, BEFORE the bearer is attached:
 *  a tool interpolating a model-supplied value into the HOST must not reach an internal
 *  address with the OAuth token. The redirect defenses only cover later hops. */
async function assertConnectorTarget(url: string): Promise<void> {
  try {
    await assertPublicUrl(url, "connector");
  } catch (e) {
    // Both BLOCK (fail closed), but an outage is a retryable transport class for the
    // loop, whereas a refusal is a dead end.
    if ((e as NodeJS.ErrnoException)?.code === "EDNS_UNRESOLVED") {
      throw new Error(`Réseau ou DNS injoignable pour ce connecteur — réessaie dans un instant.`);
    }
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`Requête connecteur bloquée (adresse interne/non publique) : ${reason}`);
  }
}

/**
 * A short, SAFE reason CODE from a provider error body (`error.status` or a `reason`
 * token): ONLY enum-like tokens, NEVER the free-text message, which could echo PII.
 */
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
    // A bare enum token only, never a sentence.
    return reason && /^[A-Za-z_]+$/.test(reason) ? reason : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `message` (status + safe reason code) is ALL the model may ever read. `detail` is the
 * provider's own free-text `error.message`, which MAY quote a real value: its one
 * destination is the per-account ENCRYPTED debug journal, never `content`.
 */
class UpstreamError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
    /** Kept so the caller can ACT on it: a 401 is a connector STATE (see `callTool`). */
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

function upstreamError(status: number, body: string, label?: string): UpstreamError {
  // 401 = the provider REFUSES the stored token: a state, not a failure. The SAME
  // actionable message as the "token absent" path: who, where, don't loop.
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

/** Authenticated JSON fetch injected into each tool. Never echoes the provider body. */
export function bearerFetchJson(accessToken: string, label?: string): ConnectorToolCtx["fetchJson"] {
  return async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    await assertConnectorTarget(url);
    const res = await fetch(url, {
      ...init,
      // Never follow a redirect on an authenticated JSON call: a cross-origin 30x must
      // not carry the bearer along. REST APIs answer directly.
      redirect: "error",
      headers: {
        // Provider-neutral defaults; a tool overrides via `init.headers`.
        Accept: "application/json",
        "User-Agent": BRAND.name,
        ...(init.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      throw upstreamError(res.status, await res.text().catch(() => ""), label);
    }
    // ⚠️ AN EMPTY BODY IS AN EMPTY SUCCESS, NOT A PARSE ERROR: a successful write often
    // answers `202`/`204` with no body, and a real side effect presented as a failure
    // repeats itself (the model retries the send).
    const text = await res.text();
    if (!text.trim()) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      // A 2xx with an unreadable body is an anomaly, NAMED rather than a bare SyntaxError.
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
    await assertConnectorTarget(url);
    // Redirects ARE followed here (media/export downloads legitimately 30x); the fetch
    // runtime strips `Authorization` on a cross-origin redirect.
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
  /** A tool declaring a `scope` is only listed when that scope was granted. */
  grantedScopes: string[];
  /** Multi-account: appended to each tool's description so the model picks the right one. */
  accountLabel?: string;
}): McpConnection {
  const { id, connector, getToken, grantedScopes, accountLabel } = opts;
  // The MODEL sees a MASKED discriminator: never the user's full address.
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
        // A call that PASSES proves the token is good again and closes the banner set below.
        if (needsReconnect.delete(id)) emitNeedsReconnect();
        return result;
      } catch (err) {
        // The connector's OWN actionable message, applied HERE so a later tool cannot
        // forget it. `detail` goes to the local journal ONLY, never `content`.
        // A 401 is a connector STATE (a DIRECT connector has no transport to drop, so
        // it is flagged at the source). 401 ALONE: a 403 is a missing right or scope.
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
