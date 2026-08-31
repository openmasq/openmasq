import type { Knex } from "knex";
import { creditsCentsForAccountType } from "./tiers.js";
import { isFreeMode } from "./freeMode.js";

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
  /** FREE MODE of the deployment (`freeMode.ts`): no budget applies. The
   *  amounts stay what they are — `consumed_cents` says what was consumed, but
   *  `allotment_cents`/`balance_cents` are 0 and mean nothing: a client that
   *  recomputed `balance ≤ 0` would wrongly read "blocked". It's `blocked` that decides,
   *  never client-side arithmetic, and `unlimited` says WHY it's false. */
  unlimited: boolean;
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
 * The window over which consumption is counted.
 *
 * ⚠️ **An EXPIRED period falls back to the calendar month**, and that's not a
 * courtesy: consumption is counted `created_at ∈ [start, end)`, so a period that has
 * passed contains NO usage from today — `consumed = 0`, full balance, `blocked`
 * never true. In other words, an overrun period doesn't mean "it still has everything left",
 * it means **unlimited credits**, silently.
 *
 * Two paths genuinely lead there: a GRANTED subscription (no webhook will ever
 * come slide its period forward) and a Stripe subscription whose `invoice.paid` got
 * lost. In both cases, falling back to the calendar month is the CLOSED reading — we
 * count something rather than nothing.
 *
 * A FUTURE period (clock drift) is handled the same way, for the same reason.
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
    unlimited: false,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
  };
}

/** Status in FREE MODE: never blocked, no budget. The actual consumption
 *  is preserved (it still shows in the Usage tab); it's the CAP that no longer
 *  exists, not the measurement. */
export function unlimitedCredits(consumed: number, start: Date, end: Date): CreditStatus {
  return {
    allotment_cents: 0,
    consumed_cents: consumed,
    balance_cents: 0,
    blocked: false,
    unlimited: true,
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
  // Free mode is read AFTER the measurement, never instead of it: consumption stays
  // true, only the cap disappears (`freeMode.ts`).
  if (isFreeMode()) return unlimitedCredits(consumed, start, end);
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
  if (isFreeMode()) return unlimitedCredits(consumed, start, end);
  return build(allotment, consumed, start, end);
}
