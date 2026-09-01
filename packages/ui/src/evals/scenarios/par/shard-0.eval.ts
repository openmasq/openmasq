// @vitest-environment jsdom
// Shard 1/8 of the parallel suite (OPENMASQ_EVAL_PARALLEL=<n> enables it) —
// each wrapper is a vitest FILE, so its own process/jsdom: the "one store per
// jsdom" constraint holds while parallelizing the scenarios.
import { defineScenarioSuite } from "../evalSuite";

defineScenarioSuite({ shard: [0, 8], enabled: !!process.env.OPENMASQ_EVAL_PARALLEL });
