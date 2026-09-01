// @vitest-environment jsdom
// Shard 3/8 of the parallel suite (OPENMASQ_EVAL_PARALLEL=<n> enables it) —
// each wrapper is a vitest FILE, hence its own process/jsdom: the constraint
// "one store per jsdom" holds while parallelizing the scenarios.
import { defineScenarioSuite } from "../evalSuite";

defineScenarioSuite({ shard: [2, 8], enabled: !!process.env.OPENMASQ_EVAL_PARALLEL });
