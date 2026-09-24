/**
 * INDIVIDUAL billing host: the API's `/v1/account` + `/v1/billing/*` with the signed-in
 * token, checkout / portal URLs opened in the system browser. Best-effort: signed out or no
 * API ⇒ null. Org billing is administered elsewhere.
 */
import Debug from "debug";
import { BillingApiError, captureError } from "@openmasq/ui";
import type { BillingHost, BillingSubscription, CreditBalance } from "@openmasq/ui";
import { authHost } from "./auth";
import { backendFetch } from "./backendFetch";
import { BACKEND_URL } from "./appEnv";

// `localStorage.debug = "openmasq:*"`. NEVER the token, the URL query, or PII.
const debug = Debug("openmasq:billing");

const BASE_URL = BACKEND_URL;

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  const method = init?.method ?? "GET";
  try {
    const token = (await authHost.getAccessToken?.()) ?? null;
    debug("api %s %s (token=%s)", method, path, token ? "présent" : "absent");
    if (!token) {
      debug("api %s %s → null (signed out)", method, path);
      return null;
    }
    const res = await backendFetch(`${BASE_URL}/v1${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    debug("api %s %s ← %d %s", method, path, res.status, res.ok ? "ok" : "non-ok");
    if (!res.ok) {
      // An HTTP FAILURE is reported like a network failure: status/path only, never the body.
      captureError({ scope: "billing", code: "http", status: res.status, message: path });
      return null;
    }
    const body = (await res.json()) as T;
    debug("api %s %s parsed ok", method, path);
    return body;
  } catch (e) {
    debug("api %s %s ✕ network/parse error: %s", method, path, e instanceof Error ? e.message : e);
    captureError({
      scope: "billing",
      code: "api-network",
      name: e instanceof Error ? e.name : undefined,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Open a Stripe URL in the user's default browser (new window → external). */
function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** A billing ACTION. Unlike `api`, THROWS a user-facing Error on any failure: an action
 *  that opens nothing must never fail silently. */
async function action<T>(path: string, body?: unknown, method: "POST" | "DELETE" = "POST"): Promise<T> {
  const token = (await authHost.getAccessToken?.()) ?? null;
  debug("action %s %s (token=%s)", method, path, token ? "présent" : "absent");
  if (!token) throw new BillingApiError(401);
  let res: Response;
  try {
    res = await backendFetch(`${BASE_URL}/v1${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    debug("action %s %s ✕ network error: %s", method, path, e instanceof Error ? e.message : e);
    captureError({
      scope: "billing",
      code: "api-network",
      name: e instanceof Error ? e.name : undefined,
      message: e instanceof Error ? e.message : String(e),
    });
    throw new Error("Connexion au service de paiement impossible. Vérifiez votre réseau.");
  }
  debug("action %s %s ← %d", method, path, res.status);
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { code?: string } | null;
    debug("action %s %s ✕ %d code=%s", method, path, res.status, detail?.code ?? "(none)");
    // Status + path + the API's bounded code, never the body.
    captureError({ scope: "billing", code: detail?.code ?? "http", status: res.status, message: path });
    throw new BillingApiError(res.status, detail?.code);
  }
  return (await res.json()) as T;
}

export const billingHost: BillingHost = {
  async getSubscription(): Promise<BillingSubscription | null> {
    debug("getSubscription");
    const d = await api<{ subscription?: any } & Record<string, any>>("/account");
    if (!d) {
      debug("getSubscription → null");
      return null;
    }
    const s = d.subscription ?? d;
    const sub = {
      tier: s.tier ?? s.account_type?.toLowerCase?.() ?? "free",
      status: s.subscription_status ?? s.status ?? "free",
      cancelAtPeriodEnd: s.cancel_at_period_end ?? false,
      currentPeriodEnd: s.current_period_end ?? undefined,
      // A grant rather than a sale decides checkout vs price swap. Absent ⇒ a real subscriber.
      isGranted: s.is_granted === true,
      // Deployment capabilities, at the ROOT of the response. `billingEnabled` unknown ⇒
      // `undefined` (leave the button); the two others unknown ⇒ OFF (offering a grant or
      // "all included" that doesn't exist is the worse lie).
      billingEnabled: typeof d.billing_enabled === "boolean" ? d.billing_enabled : undefined,
      selfGrantEnabled: d.self_grant_enabled === true,
      freeMode: d.free_mode === true,
    };
    debug("getSubscription → tier=%s status=%s cancelAtEnd=%s", sub.tier, sub.status, sub.cancelAtPeriodEnd);
    return sub;
  },

  async getCredits(): Promise<CreditBalance | null> {
    debug("getCredits");
    const d = await api<{ credits?: any } & Record<string, any>>("/billing/credits");
    if (!d) {
      debug("getCredits → null");
      return null;
    }
    const c = d.credits ?? d;
    if (c.allotment_cents == null) {
      debug("getCredits → null (no allotment)");
      return null;
    }
    debug("getCredits → blocked=%s allotment=%d consumed=%d", !!c.blocked, c.allotment_cents ?? 0, c.consumed_cents ?? 0);
    return {
      blocked: !!c.blocked,
      allotmentCents: c.allotment_cents ?? 0,
      consumedCents: c.consumed_cents ?? 0,
      balanceCents: c.balance_cents ?? 0,
      unlimited: c.unlimited === true,
    };
  },

  async startCheckout(tier: string): Promise<void> {
    debug("startCheckout tier=%s", tier);
    // `origin` is an allow-listed SURFACE name, never a URL: the server owns the destination.
    const d = await action<{ checkout_url?: string; url?: string }>("/billing/checkout", {
      tier,
      origin: "desktop",
    });
    const url = d.checkout_url ?? d.url;
    debug("startCheckout checkout_url=%s", url ? "présent" : "absent");
    if (!url) throw new BillingApiError(500);
    debug("startCheckout → openExternal");
    openExternal(url);
  },

  async isTester(): Promise<boolean> {
    // The flag travels on `/account`. Fail-closed: any failure counts as "off".
    try {
      const sub = await billingHost.getSubscription();
      return sub?.selfGrantEnabled === true;
    } catch {
      return false;
    }
  },

  async selfGrant(tier: string): Promise<void> {
    // No checkout, no browser: the tier is set server-side.
    debug("selfGrant tier=%s", tier);
    await action<{ ok: boolean; tier: string }>("/billing/grant", { tier });
    debug("selfGrant → done");
  },

  async selfRevoke(): Promise<void> {
    debug("selfRevoke");
    await action<{ ok: boolean }>("/billing/grant", undefined, "DELETE");
    debug("selfRevoke → done");
  },

  async changeTier(tier: string): Promise<void> {
    // In-place price swap of an ACTIVE subscription, no browser round-trip.
    debug("changeTier tier=%s", tier);
    await action<{ tier: string; changed: boolean }>("/billing/change-tier", { tier });
    debug("changeTier → done");
  },

  onReturn(cb: () => void): () => void {
    // The `<protocol>://billing/callback` deep link after checkout.
    const off = window.openmasq?.billing?.onCallback?.(() => cb());
    return off ?? (() => {});
  },

  async openPortal(): Promise<void> {
    debug("openPortal");
    const d = await action<{ portal_url?: string; url?: string }>("/billing/portal", { origin: "desktop" });
    const url = d.portal_url ?? d.url;
    debug("openPortal portal_url=%s", url ? "présent" : "absent");
    if (!url) throw new BillingApiError(500);
    debug("openPortal → openExternal");
    openExternal(url);
  },
};
