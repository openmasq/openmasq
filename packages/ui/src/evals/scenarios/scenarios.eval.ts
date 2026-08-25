// @vitest-environment jsdom
// The SERIAL whole-catalog eval (`pnpm eval`). All machinery lives in `evalSuite.ts`;
// the parallel path is the `par/shard-*.eval.ts` wrappers (OPENMASQ_EVAL_PARALLEL=<n>)
// — this file SKIPS then, so the catalog never runs twice in one invocation.
import { defineScenarioSuite } from "./evalSuite";

defineScenarioSuite({ enabled: !process.env.OPENMASQ_EVAL_PARALLEL });
