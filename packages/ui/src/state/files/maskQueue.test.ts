import { describe, expect, it } from "vitest";
import { createJobQueue } from "./maskQueue";

/** A job whose run the test ends by hand; `started` / `aborted` record what happened. */
function job(key: string, group = "g") {
  const rec = { started: false, aborted: false, ahead: [] as number[], end: () => {} };
  return {
    rec,
    job: {
      key,
      group,
      onQueued: (n: number) => rec.ahead.push(n),
      run: (signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          rec.started = true;
          rec.end = resolve;
          signal.addEventListener("abort", () => (rec.aborted = true));
        }),
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("maskQueue — one masking run at a time, first in first out", () => {
  it("runs ONE job; the next waits and is told how many are ahead", async () => {
    const q = createJobQueue();
    const a = job("a");
    const b = job("b");
    const c = job("c");
    q.enqueue(a.job);
    q.enqueue(b.job);
    q.enqueue(c.job);
    expect([a.rec.started, b.rec.started, c.rec.started]).toEqual([true, false, false]);
    expect(b.rec.ahead.at(-1)).toBe(1);
    expect(c.rec.ahead.at(-1)).toBe(2);
    a.rec.end();
    await tick();
    expect(b.rec.started).toBe(true);
    expect(c.rec.ahead.at(-1)).toBe(1);
  });

  it("cancelling the RUNNING job aborts it and frees the slot at once", async () => {
    const q = createJobQueue();
    const a = job("a");
    const b = job("b");
    q.enqueue(a.job);
    q.enqueue(b.job);
    q.cancel("a");
    expect(a.rec.aborted).toBe(true);
    expect(b.rec.started).toBe(true);
    // The cancelled run settling LATE must not free the next job's slot.
    a.rec.end();
    await tick();
    const c = job("c");
    q.enqueue(c.job);
    expect(c.rec.started).toBe(false);
  });

  it("re-enqueuing a key replaces its previous run (a retry)", () => {
    const q = createJobQueue();
    const first = job("a");
    const retry = job("a");
    q.enqueue(first.job);
    q.enqueue(retry.job);
    expect(first.rec.aborted).toBe(true);
    expect(retry.rec.started).toBe(true);
  });

  it("cancelGroup stops every job of a deleted conversation, and only those", () => {
    const q = createJobQueue();
    const a = job("a", "gone");
    const b = job("b", "kept");
    const c = job("c", "gone");
    q.enqueue(a.job);
    q.enqueue(b.job);
    q.enqueue(c.job);
    q.cancelGroup("gone");
    expect(a.rec.aborted).toBe(true);
    expect(q.has("c")).toBe(false);
    expect(c.rec.started).toBe(false);
    expect(b.rec.started).toBe(true);
  });

  it("a run that throws synchronously still frees the slot", async () => {
    const q = createJobQueue();
    q.enqueue({ key: "x", group: "g", run: () => { throw new Error("boom"); } });
    await tick();
    const b = job("b");
    q.enqueue(b.job);
    expect(b.rec.started).toBe(true);
  });
});
