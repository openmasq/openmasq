[Français](README.fr.md)

# @openmasq/credits

**Billing tiers and the prepaid-credit engine, for deployments that charge for model use.**

The app built from this repository and the app the brand publishes sell nothing (see
[Build from source](../../README.md#build-from-source)). This package exists for someone who
deploys the private backend behind the `OPENMASQ_BILLING` gate and bills for it. That backend
imports it so its numbers match what the app shows. In this repository its only consumer is a
parity test in `@openmasq/ui` (`packages/ui/src/state/billing/billing.parity.test.ts`).

## What's inside

- **Tiers**: `AccountType` and `CREDITS_CENTS_PER_SEAT`, the monthly credit allotment per
  seat in eurocents (`src/tiers.ts`).
- **Cost**: `deriveCreditCents` turns a model and token counts into credits, from the prices
  in `@openmasq/llm`; `meterCachedUsage` applies the cache multipliers (`src/deriveCost.ts`).
- **Balance**: `creditPeriod`, `getOrgCredits` and `getUserCredits` compute a
  `CreditStatus` (`src/credits.ts`).
- **Scope and usage**: `resolveCreditScope` and `recordUsage` (`src/scope.ts`).
- **Free mode**: `isFreeMode`, true when `OPENMASQ_FREE_MODE=1` (`src/freeMode.ts`).

The queries take an injected `Knex` handle. This repository builds the package and tests the
pure logic; the queries need a live database.

## Develop

```bash
pnpm --filter @openmasq/credits build       # tsup → dist/
pnpm --filter @openmasq/credits typecheck
pnpm test packages/credits                  # from the repository root
```

> [!NOTE]
> To run your own stack, see [`SELF_HOSTING.md`](../../SELF_HOSTING.md).
