// Account type stored on users.user_account_type / organizations.organization_
// account_type (plain text, no DB constraint). FREE = no active paid plan; PRO
// is legacy (pre-3-tier rows).
export type AccountType = "FREE" | "SOLO" | "TEAM" | "SCALE" | "PRO";

// Included monthly model-usage budget PER SEAT, in EUR minor units (eurocents).
// This is the SINGLE source-of-truth for the ALLOTMENT (Solo 800 / Team 800): the
// backend's Stripe tier catalog DERIVES its `creditsCents` from here via
// `creditsCentsForAccountType` (apps/backend .../subscriptions/tiers.ts), so there is
// no hand-kept duplicate to drift (rule 9). FREE/PRO have no budget → platform models
// are subscription-only.
//
// ⚠️ SOLO and TEAM are deliberately IDENTICAL (12 €/seat, 8 € of credits). What
// separates them is not the volume but WHO SETS THE RULES: Team adds org-imposed
// redaction categories, allow-listed models/connectors, one invoice and a central audit
// log. If a future change makes them differ again, say so where it is sold, not here.
//
// ⚠️ SCALE is RETIRED from the sellable catalog (it left `var.tiers` in
// infra/modules/stripe and `TIER_LIST` in the backend), but it KEEPS its allotment on
// purpose: Stripe cannot delete a price, only deactivate it, so a subscription taken
// before the retirement keeps billing and keeps arriving on the webhook. Dropping the
// row here would silently grant those seats 0 credit — they paid 32 €. Same treatment
// as the legacy PRO row: unreachable for a NEW purchase, still honoured for an old one.
export const CREDITS_CENTS_PER_SEAT: Record<AccountType, number> = {
  FREE: 0,
  PRO: 0,
  SOLO: 800,
  TEAM: 800,
  SCALE: 2800,
};

export const creditsCentsForAccountType = (accountType: string): number =>
  CREDITS_CENTS_PER_SEAT[accountType as AccountType] ?? 0;
