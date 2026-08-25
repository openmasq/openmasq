import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Load `.env.test` (repo root) into the eval process — the OpenCode Zen key
// (`ZEN_API_KEY`) lives there, out of the repo history. KEY=VALUE lines only; existing
// env always wins so a shell override stays possible.
try {
  for (const line of readFileSync(resolve(__dirname, ".env.test"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env.test — the suites self-skip */
}

// The EVALS — real prompts against a real model (`pnpm eval`).
//
// A separate config, and a `*.eval.ts` glob the root `vitest.config.ts` does not match,
// so `pnpm test` can never pull a paid, stochastic suite into the free one (root rule 4).
// They are a diagnostic, not a gate: never wire this into CI as a required check.
//
// Needs `OPENMASQ_EVAL_API_KEY` (or `OPENAI_API_KEY`); the suite self-skips without one.
// Knobs: `OPENMASQ_EVAL_PROVIDER`, `OPENMASQ_EVAL_MODEL`, `OPENMASQ_EVAL_RUNS`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.eval.ts"],
    // Same Node ≥26 web-storage shim as the unit config — the eval scenarios run the
    // jsdom store harness too. See scripts/vitest.webstorage-setup.ts.
    setupFiles: ["./scripts/vitest.webstorage-setup.ts"],
    // Real API calls: a turn is several round-trips, and a scenario scores N of them.
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Serial by DEFAULT. Parallel evals race the provider's rate limit, and a 429 would
    // score as a model failure — measuring our own concurrency instead of the model's
    // behaviour. OPT-IN parallelism: OPENMASQ_EVAL_PARALLEL=<n> runs the sharded
    // wrapper files (`scenarios/par/shard-*.eval.ts`) across n workers — each shard is
    // its OWN jsdom/process, so the store's shared-localStorage constraint holds.
    fileParallelism: !!process.env.OPENMASQ_EVAL_PARALLEL,
    maxWorkers: Number(process.env.OPENMASQ_EVAL_PARALLEL || 1),
    maxConcurrency: 1,
    passWithNoTests: true,
  },
});
