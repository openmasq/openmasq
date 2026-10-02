/**
 * Desktop "Your feedback" host. POSTs the user's feedback to the backend
 * `/v1/feedback` with the signed-in Supabase token; the backend emails it
 * to the team and takes the identity from that VERIFIED token (rule 7 — the body
 * carries no email, and must not).
 *
 * ⚠️ Unlike the billing getters next door, this is NOT best-effort: it REJECTS on
 * any failure. The modal shows "your message safely reached the team" only
 * when `send` resolves, so swallowing an error here would turn that into a lie and
 * silently bin what the user wrote.
 */
import Debug from "debug";
import { BRAND } from "@openmasq/branding";
import { captureError, feedbackMailto, getMessages, initialLocale } from "@openmasq/ui";
import type { FeedbackHost, Feedback } from "@openmasq/ui";
import { authHost } from "./auth";
import { backendFetch } from "./backendFetch";
import { BACKEND_URL } from "./appEnv";

// Enable with `localStorage.debug = "openmasq:avis"`. Privacy: method/path/status only
// — NEVER the token and NEVER the user's message (it is their free text).
const debug = Debug("openmasq:avis");

const BASE_URL = BACKEND_URL;

/** The UI copy at the moment of the call: this host lives outside React, so it reads the
 *  device's language the way the provider boots (`initialLocale`). The modal renders the
 *  failures verbatim. */
const copy = () => getMessages(initialLocale());

export const feedbackHost: FeedbackHost = {
  async send(feedback: Feedback): Promise<void> {
    const token = (await authHost.getAccessToken?.()) ?? null;
    if (!token) {
      debug("send → refusé (déconnecté)");
      throw new Error(copy().runtime.misc.feedback.signedOut);
    }
    let res: Response;
    try {
      res = await backendFetch(`${BASE_URL}/v1/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(feedback),
      });
    } catch (e) {
      debug("send ✕ réseau: %s", e instanceof Error ? e.message : e);
      // The scrubbed error transport — never the avis text itself.
      captureError({
        scope: "avis",
        code: "network",
        name: e instanceof Error ? e.name : undefined,
        message: e instanceof Error ? e.message : String(e),
      });
      throw new Error(copy().runtime.misc.feedback.network);
    }
    debug("send ← %d", res.status);
    if (!res.ok) {
      captureError({ scope: "avis", code: "http", status: res.status });
      const f = copy().runtime.misc.feedback;
      throw new Error(res.status === 401 ? f.signedOut : f.unavailable);
    }
  },
};

/**
 * The BACKEND-LESS transport: hand the avis to the user's own mail client. The
 * `mailto:` URL goes through `window.open`, which main's `setWindowOpenHandler`
 * routes into `safeOpenExternal` — the scheme-gated single door to the OS.
 * Resolving means the client was HANDED the message, nothing more; the modal reads
 * `kind` and words its success screen accordingly, with `address` as the manual
 * fallback for a machine where nothing answers the scheme.
 */
export const mailtoFeedbackHost: FeedbackHost = {
  kind: "mailto",
  address: BRAND.supportEmail,
  async send(feedback: Feedback): Promise<void> {
    debug("send → mailto (%s)", feedback.category);
    window.open(feedbackMailto(feedback, BRAND.supportEmail, BRAND.name, copy()));
  },
};
