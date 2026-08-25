import type { Knex } from "knex";
import { getOrgCredits, getUserCredits, type CreditStatus } from "./credits.js";
import { deriveCreditCents } from "./deriveCost.js";

export interface CreditScope {
  id_user: number;
  /** null = solo user → personal credits. */
  id_organization: number | null;
  credits: CreditStatus;
}

// Resolve a caller to their credit scope: their PRIMARY org's workspace pool
// (first ACTIVE membership, orgs ordered by created_at) or, if solo, personal
// credits (id_organization = null). Multi-org → first (documented simplification).
// null = user not found. Shared by the container's pre-check + meter so both agree.
//
// The `identifier` may be EITHER the Supabase auth id (the JWT `sub`, mirrored to
// `users.id` — this is what the gateway passes) OR the app-level `users.user_uuid`.
// We match on both because the two columns differ (`attachUser` sets `id` = the
// auth sub and lets `user_uuid` default to a separate app uuid); querying only
// `user_uuid` silently missed every caller that passes the auth sub — the gateway
// did, so its credit scope never resolved and metering was skipped.
export async function resolveCreditScope(db: Knex, identifier: string): Promise<CreditScope | null> {
  const user = (await db("users")
    .where("id", identifier)
    .orWhere("user_uuid", identifier)
    .first()) as { id_user: number; user_account_type?: string | null } | undefined;
  if (!user) return null;
  const orgs = (await db("organizations as o")
    .join("organization_members as m", "m.id_organization", "o.id_organization")
    .where("m.id_user", user.id_user)
    .select("o.*", "m.status")
    .orderBy("o.created_at", "asc")) as {
    id_organization: number;
    status: string;
    organization_account_type?: string | null;
  }[];
  const org = orgs.find((o) => o.status === "active");
  const credits = org
    ? await getOrgCredits(db, org.id_organization, org.organization_account_type ?? "FREE")
    : await getUserCredits(db, user.id_user, user.user_account_type ?? "FREE");
  return { id_user: user.id_user, id_organization: org ? org.id_organization : null, credits };
}

/** Record ONE billable usage row (server-derived cost). The authoritative
 *  deduction — cost is derived here, never trusted from a client. */
export async function recordUsage(
  db: Knex,
  e: {
    id_organization: number | null;
    id_user: number;
    model: string;
    tokensIn: number;
    tokensOut: number;
    provider?: string;
    billable?: boolean;
  },
): Promise<void> {
  const billable = e.billable ?? true;
  const credits = billable ? deriveCreditCents(e.model, e.tokensIn, e.tokensOut) : 0;
  await db("usage_events").insert({
    id_organization: e.id_organization,
    id_user: e.id_user,
    provider: e.provider ?? "scaleway",
    model: e.model,
    tokens_in: e.tokensIn,
    tokens_out: e.tokensOut,
    credits,
    billable,
  });
}
