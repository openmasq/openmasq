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
import { captureError } from "@openmasq/ui";
import type { AvisHost, Feedback } from "@openmasq/ui";
import { authHost } from "./auth";
import { backendFetch } from "./backendFetch";
import { BACKEND_URL } from "./appEnv";

// Enable with `localStorage.debug = "openmasq:avis"`. Privacy: method/path/status only
// — NEVER the token and NEVER the user's message (it is their free text).
const debug = Debug("openmasq:avis");

const BASE_URL = BACKEND_URL;

/** User-facing (French) failures — the modal renders these verbatim. */
const SIGNED_OUT = "Connectez-vous pour envoyer un avis.";
const UNAVAILABLE =
  "Ça n'a pas marché de notre côté. Réessayez dans un moment — votre message est toujours là.";
const NETWORK =
  "Envoi impossible — vérifiez votre connexion. Votre message est toujours là.";

export const avisHost: AvisHost = {
  async send(avis: Feedback): Promise<void> {
    const token = (await authHost.getAccessToken?.()) ?? null;
    if (!token) {
      debug("send → refusé (déconnecté)");
      throw new Error(SIGNED_OUT);
    }
    let res: Response;
    try {
      res = await backendFetch(`${BASE_URL}/v1/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(avis),
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
      throw new Error(NETWORK);
    }
    debug("send ← %d", res.status);
    if (!res.ok) {
      captureError({ scope: "avis", code: "http", status: res.status });
      throw new Error(res.status === 401 ? SIGNED_OUT : UNAVAILABLE);
    }
  },
};
