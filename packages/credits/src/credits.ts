import type { Knex } from "knex";
import { creditsCentsForAccountType } from "./tiers.js";

// Prepaid MONTHLY budget in eurocents. Allotment = tier credits × seats (org:
// active members; individual: 1). Consumed = Σ server-derived cost of BILLABLE
// usage this period. Balance = allotment − consumed; blocked when ≤ 0. All reads
// take an injected `knex` handle so the SAME logic runs in the backend AND the
// redact-fn container (against Neon's pooled endpoint) — one source of truth.

export interface CreditStatus {
  allotment_cents: number;
  consumed_cents: number;
  balance_cents: number;
  /** No budget left for billable (platform answer-model) usage. */
  blocked: boolean;
  period_start: string;
  period_end: string;
}

interface SubLike {
  subscription_status: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
}

function calendarMonth(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

/**
 * La fenêtre sur laquelle on compte la consommation.
 *
 * ⚠️ **Une période PÉRIMÉE retombe sur le mois calendaire**, et ce n'est pas une
 * politesse : la consommation se compte `created_at ∈ [start, end)`, donc une fenêtre
 * passée ne contient AUCUN usage d'aujourd'hui — `consommé = 0`, solde plein, `blocked`
 * jamais vrai. Autrement dit, une période dépassée ne veut pas dire « il lui reste tout »,
 * elle veut dire **crédits illimités**, silencieusement.
 *
 * Deux chemins y mènent pour de vrai : un abonnement OCTROYÉ (aucun webhook ne viendra
 * jamais faire glisser sa période) et un abonnement Stripe dont un `invoice.paid` s'est
 * perdu. Dans les deux cas, retomber sur le mois calendaire est la lecture FERMÉE — on
 * compte quelque chose plutôt que rien.
 *
 * Une période FUTURE (dérive d'horloge) est traitée pareil, pour la même raison.
 */
export function creditPeriod(sub?: SubLike, now: Date = new Date()) {
  const paid = sub && (sub.subscription_status === "active" || sub.subscription_status === "trialing");
  if (paid && sub!.current_period_start && sub!.current_period_end) {
    const start = new Date(sub!.current_period_start);
    const end = new Date(sub!.current_period_end);
    if (start.getTime() <= now.getTime() && now.getTime() < end.getTime()) return { start, end };
  }
  return calendarMonth();
}

async function consumedCents(
  db: Knex,
  where: (q: Knex.QueryBuilder) => Knex.QueryBuilder,
  start: Date,
  end: Date,
): Promise<number> {
  const row = await where(db("usage_events"))
    .where("billable", true)
    .andWhere("created_at", ">=", start)
    .andWhere("created_at", "<", end)
    .sum({ c: "credits" })
    .first();
  return Number((row as { c?: number | string } | undefined)?.c ?? 0);
}

function build(allotment: number, consumed: number, start: Date, end: Date): CreditStatus {
  const balance = allotment - consumed;
  return {
    allotment_cents: allotment,
    consumed_cents: consumed,
    balance_cents: balance,
    blocked: balance <= 0,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
  };
}

/** Workspace-pool credits for an organization (allotment = tier × active seats). */
export async function getOrgCredits(
  db: Knex,
  id_organization: number,
  accountType: string,
): Promise<CreditStatus> {
  const sub = (await db("subscriptions").where({ id_organization }).first()) as SubLike | undefined;
  const { start, end } = creditPeriod(sub);
  const [{ count }] = await db("organization_members")
    .where({ id_organization, status: "active" })
    .count<{ count: string }[]>({ count: "*" });
  const seats = Math.max(1, Number(count));
  const allotment = creditsCentsForAccountType(accountType) * seats;
  const consumed = await consumedCents(db, (q) => q.where({ id_organization }), start, end);
  return build(allotment, consumed, start, end);
}

/** Personal credits for an individual subscriber (allotment = tier × 1). */
export async function getUserCredits(
  db: Knex,
  id_user: number,
  accountType: string,
): Promise<CreditStatus> {
  const sub = (await db("subscriptions").where({ id_user }).first()) as SubLike | undefined;
  const { start, end } = creditPeriod(sub);
  const allotment = creditsCentsForAccountType(accountType);
  const consumed = await consumedCents(
    db,
    (q) => q.where({ id_user }).whereNull("id_organization"),
    start,
    end,
  );
  return build(allotment, consumed, start, end);
}
