# @openmasq/credits — billing tiers and prepaid credits

The plan tiers and the credit amounts as **one fact**, plus the DB-agnostic credit
engine (pure logic + queries against an injected handle). The server side that meters
lives in a separate repository and imports this so both sides compute the same numbers.

**Start here.** `src/index.ts`.
