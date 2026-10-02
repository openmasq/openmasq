import { describe, expect, it } from "vitest";
import { createExtractQueue } from "./extractQueue";

/** A job the test finishes by hand. */
const deferred = () => {
  let resolve!: (v: string) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createExtractQueue — one document at a time, in order", () => {
  it("runs a single job at once and starts the next only when it settles", async () => {
    const q = createExtractQueue(1);
    const a = deferred();
    const b = deferred();
    const started: string[] = [];
    const ra = q.run(() => (started.push("a"), a.promise));
    const rb = q.run(() => (started.push("b"), b.promise));
    await tick();
    expect(started).toEqual(["a"]);
    a.resolve("A");
    expect(await ra).toBe("A");
    await tick();
    expect(started).toEqual(["a", "b"]);
    b.resolve("B");
    expect(await rb).toBe("B");
  });

  it("tells a waiting file how many are ahead, and again as the line moves", async () => {
    const q = createExtractQueue(1);
    const jobs = [deferred(), deferred(), deferred()];
    const ahead: number[][] = [[], [], []];
    const runs = jobs.map((j, i) => q.run(() => j.promise, (n) => ahead[i].push(n)));
    await tick();
    // The first starts at once (never "waiting"); the 2nd has 1 ahead, the 3rd has 2.
    expect(ahead).toEqual([[], [1], [2]]);
    jobs[0].resolve("x");
    await runs[0];
    await tick();
    expect(ahead[2]).toEqual([2, 1]);
    jobs[1].resolve("y");
    jobs[2].resolve("z");
    await Promise.all(runs);
  });

  it("a failed job frees its slot: the next file still runs", async () => {
    const q = createExtractQueue(1);
    const a = deferred();
    const ra = q.run(() => a.promise);
    const rb = q.run(async () => "B");
    a.reject(new Error("ocr"));
    await expect(ra).rejects.toThrow("ocr");
    expect(await rb).toBe("B");
  });

  it("a job that throws synchronously frees its slot too", async () => {
    const q = createExtractQueue(1);
    const ra = q.run((): Promise<string> => {
      throw new Error("boom");
    });
    const rb = q.run(async () => "B");
    await expect(ra).rejects.toThrow("boom");
    expect(await rb).toBe("B");
  });

  it("the job — hence its clock — does not start while it waits", async () => {
    const q = createExtractQueue(1);
    const a = deferred();
    let bStartedAt: number | null = null;
    q.run(() => a.promise);
    const rb = q.run(async () => {
      bStartedAt = Date.now();
      return "B";
    });
    await tick();
    expect(bStartedAt).toBeNull();
    a.resolve("A");
    await rb;
    expect(bStartedAt).not.toBeNull();
  });

  it("honours a wider concurrency", async () => {
    const q = createExtractQueue(2);
    const started: number[] = [];
    const jobs = [deferred(), deferred(), deferred()];
    jobs.forEach((j, i) => q.run(() => (started.push(i), j.promise)));
    await tick();
    expect(started).toEqual([0, 1]);
    jobs.forEach((j) => j.resolve(""));
  });
});
