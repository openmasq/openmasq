/**
 * Desktop INDIVIDUAL (per-person) billing host. Talks to the backend
 * `/v1/account + /v1/billing/*` with the signed-in Supabase token, and opens
 * Stripe Checkout / portal URLs in the system browser. Best-effort: signed out or
 * no backend → getters return null. Org (per-seat) billing is administered in the
 * web console, not here.
 */
import Debug from "debug";
import { BillingApiError, captureError } from "@openmasq/ui";
import type { BillingHost, BillingSubscription, CreditBalance } from "@openmasq/ui";
import { authHost } from "./auth";
import { backendFetch } from "./backendFetch";
import { BACKEND_URL } from "./appEnv";

// Enable at runtime with `localStorage.debug = "openmasq:*"` (or `openmasq:billing`)
// in the devtools console. Privacy: we log method/path/status/codes/booleans and
// non-sensitive values (tier) — NEVER the token, the URL query, or PII.
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
      // An HTTP FAILURE is reported like a network failure — status/path only,
      // never the body. The gap measured on 07/08: two change-tier 502s emitted
      // NO event at all (only the network was captured), while feedback reported
      // its 400s — the incident was only seen because a user ran into it.
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

/** Send a billing ACTION and return the parsed body. Unlike `api`, this THROWS a
 *  user-facing Error on any failure (signed out, non-2xx, network) so the caller
 *  can surface it — an action that opens nothing must never fail silently.
 *  The METHOD is a parameter (revoking a self-grant is a DELETE): a
 *  second twin function would mean maintaining the same error handling twice over. */
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
    // Same rule as `api`: the HTTP failure of a payment ACTION is reported —
    // status + path + the backend's bounded code, never the body.
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
      // Grant (included tier / given access) rather than a sale: decides whether a tier
      // change goes through CHECKOUT or through a Stripe price swap. Absent ⇒ `false`, so
      // the behavior of a real subscriber — that's what an older backend served.
      isGranted: s.is_granted === true,
      // Read at the ROOT of the response, not on the subscription: it's a deployment
      // capability, not an account property. Absent ⇒ `undefined`, which the UI reads
      // as "unknown, leave the button" (see `BillingSubscription`).
      billingEnabled: typeof d.billing_enabled === "boolean" ? d.billing_enabled : undefined,
      // Same read, same reason: tester mode is a DEPLOYMENT capability.
      // Absent ⇒ `undefined` ⇒ the normal offer, never a "Grant myself" button on a
      // backend that would refuse it — here the unknown reads as off, the opposite of
      // `billingEnabled`: offering a grant that doesn't exist is a DEAD button.
      selfGrantEnabled: d.self_grant_enabled === true,
      // Same family: a deployment capability, at the root, and the unknown reads
      // as OFF — promising "all included" to someone the gateway will answer 402 is the worse
      // of the two lies.
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
    // The backend returns `checkout_url` (Stripe Checkout session URL); keep `url`
    // as a fallback in case the contract ever changes. Reading the wrong field is
    // why the button used to "redirect nowhere". Throws on failure (surfaced by UI).
    debug("startCheckout tier=%s", tier);
    // `origin` tells the backend which surface to send the user back to — here the
    // web bounce page that deep-links into this app. It is an allow-listed SURFACE
    // name, never a URL: the server owns the destination.
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
    // The flag travels on `/account` (a single route the app reads): we don't
    // open a separate round trip for it. Fail-closed — any failure counts as "off".
    try {
      const sub = await billingHost.getSubscription();
      return sub?.selfGrantEnabled === true;
    } catch {
      return false;
    }
  },

  async selfGrant(tier: string): Promise<void> {
    // Self-grant: no Stripe, no browser — the tier is set server-side,
    // which reads the global switch itself. Throws a readable message on refusal.
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
    // In-app upgrade/downgrade of an ACTIVE subscription: an in-place Stripe price
    // swap (prorated), no browser round-trip. Throws a user-facing message on
    // failure (surfaced by the UI); the caller refreshes on success.
    debug("changeTier tier=%s", tier);
    await action<{ tier: string; changed: boolean }>("/billing/change-tier", { tier });
    debug("changeTier → done");
  },

  onReturn(cb: () => void): () => void {
    // Fired when the app returns from Stripe Checkout via the
    // `<protocol>://billing/callback` deep link (bounced by the web return page).
    const off = window.openmasq?.billing?.onCallback?.(() => cb());
    return off ?? (() => {});
  },

  async openPortal(): Promise<void> {
    // The backend returns `portal_url` (Stripe Billing Portal URL).
    debug("openPortal");
    const d = await action<{ portal_url?: string; url?: string }>("/billing/portal", { origin: "desktop" });
    const url = d.portal_url ?? d.url;
    debug("openPortal portal_url=%s", url ? "présent" : "absent");
    if (!url) throw new BillingApiError(500);
    debug("openPortal → openExternal");
    openExternal(url);
  },
};
