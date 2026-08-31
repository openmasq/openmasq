/**
 * Desktop INDIVIDUAL (per-person) billing host. Talks to the backend
 * `/api-features/subscriptions/*` with the signed-in Supabase token, and opens
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
    const res = await backendFetch(`${BASE_URL}/api-features${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
    debug("api %s %s ← %d %s", method, path, res.status, res.ok ? "ok" : "non-ok");
    if (!res.ok) {
      // Un ÉCHEC HTTP se rapporte comme un échec réseau — statut/chemin seulement,
      // jamais le corps. Le trou mesuré le 07/08 : deux 502 de change-tier n'ont émis
      // AUCUN événement (seul le réseau était capturé), pendant que l'avis rapportait
      // ses 400 — l'incident ne s'est vu que parce que l'utilisateur est tombé dessus.
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
 *  La MÉTHODE est un paramètre (le retrait d'un auto-octroi est un DELETE) : une
 *  seconde fonction jumelle aurait deux fois la même gestion d'erreur à tenir. */
async function action<T>(path: string, body?: unknown, method: "POST" | "DELETE" = "POST"): Promise<T> {
  const token = (await authHost.getAccessToken?.()) ?? null;
  debug("action %s %s (token=%s)", method, path, token ? "présent" : "absent");
  if (!token) throw new BillingApiError(401);
  let res: Response;
  try {
    res = await backendFetch(`${BASE_URL}/api-features${path}`, {
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
    // Même règle que `api` : l'échec HTTP d'une ACTION de paiement se rapporte —
    // statut + chemin + code borné du backend, jamais le corps.
    captureError({ scope: "billing", code: detail?.code ?? "http", status: res.status, message: path });
    throw new BillingApiError(res.status, detail?.code);
  }
  return (await res.json()) as T;
}

export const billingHost: BillingHost = {
  async getSubscription(): Promise<BillingSubscription | null> {
    debug("getSubscription");
    const d = await api<{ subscription?: any } & Record<string, any>>("/subscriptions/me");
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
      // Octroi (palier inclus / accès donné) plutôt que vente : décide si un changement de
      // palier passe par la CAISSE ou par l'échange de prix Stripe. Absent ⇒ `false`, donc
      // le comportement d'un vrai abonné — c'est celui qu'un backend plus ancien servait.
      isGranted: s.is_granted === true,
      // Se lit à la RACINE de la réponse, pas sur l'abonnement : c'est une capacité du
      // déploiement, pas une propriété du compte. Absent ⇒ `undefined`, que l'UI lit
      // comme « inconnu, laisse le bouton » (cf. `BillingSubscription`).
      billingEnabled: typeof d.billing_enabled === "boolean" ? d.billing_enabled : undefined,
      // Même lecture, même raison : le mode testeur est une capacité du DÉPLOIEMENT.
      // Absent ⇒ `undefined` ⇒ l'offre normale, jamais un bouton « S'octroyer » sur un
      // backend qui refuserait — ici l'inconnu se lit comme éteint, à l'inverse de
      // `billingEnabled` : proposer un octroi qui n'existe pas est un bouton MORT.
      selfGrantEnabled: d.self_grant_enabled === true,
      // Même famille : une capacité du déploiement, à la racine, et l'inconnu se lit
      // ÉTEINT — promettre « tout inclus » à qui la passerelle répondra 402 est le pire
      // des deux mensonges.
      freeMode: d.free_mode === true,
    };
    debug("getSubscription → tier=%s status=%s cancelAtEnd=%s", sub.tier, sub.status, sub.cancelAtPeriodEnd);
    return sub;
  },

  async getCredits(): Promise<CreditBalance | null> {
    debug("getCredits");
    const d = await api<{ credits?: any } & Record<string, any>>("/subscriptions/credits");
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
    const d = await action<{ checkout_url?: string; url?: string }>("/subscriptions/checkout", {
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
    // Le drapeau voyage sur `/subscriptions/me` (une seule route lue par l'app) : on ne
    // rouvre pas un aller-retour pour lui. Fail-closed — toute panne vaut « éteint ».
    try {
      const sub = await billingHost.getSubscription();
      return sub?.selfGrantEnabled === true;
    } catch {
      return false;
    }
  },

  async selfGrant(tier: string): Promise<void> {
    // L'auto-octroi : aucun Stripe, aucun navigateur — le palier est posé côté serveur,
    // qui relit l'interrupteur global lui-même. Jette un message lisible en cas de refus.
    debug("selfGrant tier=%s", tier);
    await action<{ ok: boolean; tier: string }>("/subscriptions/self-grant", { tier });
    debug("selfGrant → done");
  },

  async selfRevoke(): Promise<void> {
    debug("selfRevoke");
    await action<{ ok: boolean }>("/subscriptions/self-grant", undefined, "DELETE");
    debug("selfRevoke → done");
  },

  async changeTier(tier: string): Promise<void> {
    // In-app upgrade/downgrade of an ACTIVE subscription: an in-place Stripe price
    // swap (prorated), no browser round-trip. Throws a user-facing message on
    // failure (surfaced by the UI); the caller refreshes on success.
    debug("changeTier tier=%s", tier);
    await action<{ tier: string; changed: boolean }>("/subscriptions/change-tier", { tier });
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
    const d = await action<{ portal_url?: string; url?: string }>("/subscriptions/portal", { origin: "desktop" });
    const url = d.portal_url ?? d.url;
    debug("openPortal portal_url=%s", url ? "présent" : "absent");
    if (!url) throw new BillingApiError(500);
    debug("openPortal → openExternal");
    openExternal(url);
  },
};
