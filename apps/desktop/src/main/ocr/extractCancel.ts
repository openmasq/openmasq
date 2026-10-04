/**
 * The cancel handles of the extractions in flight, keyed by (OWNER, job id). The job id is
 * the renderer's (its chip id), so it is untrusted: shape-checked here, and a cancel only
 * reaches a job registered under the SAME owner — the webContents that started it. A
 * renderer can therefore stop its own reads and nothing else; an unknown or malformed id
 * is a no-op. A cancel only ever STOPS work (no read, no grant), so a wrong one costs a
 * re-attach, never data.
 */

/** A job id the renderer may name: plain, bounded. Anything else ⇒ not cancellable. */
const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;

const jobs = new Map<string, Set<AbortController>>();
const keyOf = (owner: number, job: string) => `${owner}:${job}`;

/**
 * Register a job for `owner`. Returns its signal (`undefined` for a missing or malformed id:
 * the job runs, uncancellable) and `done`, to call once it settles — always, or the handle leaks.
 */
export function registerExtractJob(owner: number, job: unknown): { signal?: AbortSignal; done: () => void } {
  if (typeof job !== "string" || !JOB_ID.test(job)) return { done: () => {} };
  const key = keyOf(owner, job);
  const ctl = new AbortController();
  const set = jobs.get(key) ?? new Set<AbortController>();
  set.add(ctl);
  jobs.set(key, set);
  return {
    signal: ctl.signal,
    done: () => {
      set.delete(ctl);
      if (!set.size && jobs.get(key) === set) jobs.delete(key);
    },
  };
}

/** Cancel `owner`'s job `job`. `false` when there was none (finished, unknown, malformed, or another owner's). */
export function cancelExtractJob(owner: number, job: unknown): boolean {
  if (typeof job !== "string" || !JOB_ID.test(job)) return false;
  const key = keyOf(owner, job);
  const set = jobs.get(key);
  if (!set) return false;
  jobs.delete(key);
  for (const ctl of set) ctl.abort();
  return true;
}
