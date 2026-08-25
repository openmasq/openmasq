// Scoring a STOCHASTIC check.
//
// A real model is not a function: the same prompt can pick a different tool on the next
// call. So an eval asserts a RATE, not an outcome — `atLeast(4, 5, …)`, never a single
// run. A one-shot `expect` on a model choice is a test that fails at random, and a test
// that fails at random gets skipped, which is worse than not having it.
//
// The exception is a SAFETY property (`leaked()`): it must hold on EVERY run, so assert
// it inside every attempt rather than scoring it. "The vault leaked 1 time in 5" is not
// a 80% pass, it is a breach.

export interface Score {
  passed: number;
  total: number;
  /** Why each failing run failed — a rate with no reasons is undiagnosable. */
  failures: string[];
}

/** Run `attempt` `total` times. It returns `true`/`undefined` for a pass, or a STRING
 *  explaining the failure. It may also throw — a throw counts as a failure, not as a
 *  crashed suite, because one flaky API 500 must not lose the other four runs. */
export async function score(
  total: number,
  attempt: (i: number) => Promise<boolean | string | undefined>,
): Promise<Score> {
  const failures: string[] = [];
  let passed = 0;
  for (let i = 0; i < total; i++) {
    try {
      const r = await attempt(i);
      if (r === true || r === undefined) passed++;
      else failures.push(`run ${i + 1}: ${r || "échec"}`);
    } catch (e) {
      failures.push(`run ${i + 1}: ${(e as Error).message}`);
    }
  }
  return { passed, total, failures };
}

/** Assert a score meets `min`/`total`, with every failure reason in the message. */
export function expectAtLeast(min: number, s: Score, what: string): void {
  if (s.passed < min) {
    throw new Error(
      `${what}\n  attendu ≥${min}/${s.total}, obtenu ${s.passed}/${s.total}\n${s.failures.map((f) => `  · ${f}`).join("\n")}`,
    );
  }
}
