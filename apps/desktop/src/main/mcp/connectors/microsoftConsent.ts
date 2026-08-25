/**
 * Microsoft ADMIN CONSENT — turning a refusal into the one action that unblocks it.
 *
 * The app's Microsoft OAuth client is MULTI-TENANT (`/common`). Some Graph scopes — reading Teams
 * channel messages, SharePoint sites — cannot be granted by an ordinary user: the tenant's
 * administrator must approve the application ONCE, for everyone. Until then the browser
 * comes back with an `AADSTS…` error and the connection fails.
 *
 * That refusal is not a bug and not the user's fault, so it must not read like one. It has
 * exactly one remedy, and the user is rarely the person who can apply it: they need a LINK
 * to hand to their administrator. This module maps the error to that link.
 *
 * ⚠️ Requiring admin consent is a property of the SCOPE, not of the connector: an org can
 * also disable user consent entirely, in which case even a scope that normally needs none
 * lands here. The copy therefore never asserts WHY the tenant refused — only what unblocks
 * it — because we cannot see the tenant's policy from here.
 */
import { BRAND } from "@openmasq/branding";

/** Where an administrator approves the app for their whole tenant. `organizations`, not a
 *  tenant id: we do not know the tenant (the refusal can arrive before any account is
 *  resolved), and the admin's own sign-in resolves it. */
const ADMIN_CONSENT_BASE = "https://login.microsoftonline.com/organizations/v2.0/adminconsent";

/**
 * AADSTS codes that mean "an administrator has to approve this".
 *  - `AADSTS90094` — "The grant requires admin permission": the scope itself is admin-only.
 *  - `AADSTS65001` — no consent recorded for the app. In THIS flow the consent screen was
 *    just shown, so a 65001 coming back means the user could not grant it themselves.
 * Both lead to the same remedy, which is why they share a branch.
 */
const ADMIN_CODES = ["AADSTS90094", "AADSTS65001"];

/** `error=consent_required` / `interaction_required` carry the same meaning without a code. */
const ADMIN_ERRORS = ["consent_required", "admin_consent_required"];

export function needsAdminConsent(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const s = raw.toLowerCase();
  return (
    ADMIN_CODES.some((c) => s.includes(c.toLowerCase())) ||
    ADMIN_ERRORS.some((e) => s.includes(e))
  );
}

/** The URL an administrator opens to approve the app for their organisation. */
export function adminConsentUrl(clientId: string, redirectUri: string): string {
  const u = new URL(ADMIN_CONSENT_BASE);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  return u.toString();
}

export interface MicrosoftAuthFailure {
  /** What the user reads. States the remedy, never blames them. */
  message: string;
  /** Present only when an administrator's approval is the remedy — the link to forward. */
  adminConsentUrl?: string;
}

/**
 * The user-facing outcome of a failed Microsoft connect.
 *
 * A refusal the user CANNOT act on alone must say so and hand over the link; anything else
 * keeps the raw provider text, which is what a support conversation actually needs. Both
 * branches surface a REAL failure rather than a silent retry — the app's rule: an honest
 * « réessayez » beats a dressed-up answer.
 */
export function microsoftAuthFailure(
  raw: string | undefined | null,
  ctx: { clientId: string; redirectUri: string },
): MicrosoftAuthFailure {
  if (!needsAdminConsent(raw)) {
    return { message: `Connexion Microsoft refusée${raw ? ` : ${raw}` : ""}.` };
  }
  return {
    message:
      `Votre organisation demande l'approbation d'un administrateur pour connecter ${BRAND.name}. ` +
      "Transmettez-lui le lien ci-dessous : une seule approbation vaut pour tous les comptes " +
      "de l'organisation, et la connexion se fera ensuite en un clic.",
    adminConsentUrl: adminConsentUrl(ctx.clientId, ctx.redirectUri),
  };
}
