import { describe, expect, it } from "vitest";
import { createPageQueue } from "./lazyPages";

const flush = () => new Promise((r) => setTimeout(r, 0));

/** A paint that resolves only when the test says so — to observe concurrency. */
function harness() {
  const log: string[] = [];
  const pending = new Map<number, () => void>();
  let inFlight = 0;
  let maxInFlight = 0;
  const q = createPageQueue({
    paint: (p) =>
      new Promise<boolean>((resolve) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        log.push(`paint ${p}`);
        pending.set(p, () => {
          inFlight--;
          pending.delete(p);
          resolve(true);
        });
      }),
    release: (p) => log.push(`release ${p}`),
  });
  const land = async (p: number) => {
    pending.get(p)?.();
    await flush();
  };
  return { q, log, land, max: () => maxInFlight };
}

/** Every page of a long PDF is reachable, but only the pages near the viewport hold a
 *  canvas: a 48-page contract painted at once is ~650 MB of canvas at dpr 2. */
describe("createPageQueue", () => {
  it("paints one page at a time, the most recently requested area first", async () => {
    const h = harness();
    h.q.want(1, true);
    h.q.want(2, true);
    h.q.want(30, true);
    await h.land(1);
    await h.land(30);
    await h.land(2);
    expect(h.log).toEqual(["paint 1", "paint 30", "paint 2"]);
    expect(h.max()).toBe(1);
  });

  it("frees a page that leaves the margin, and paints it again on return", async () => {
    const h = harness();
    h.q.want(3, true);
    await h.land(3);
    h.q.want(3, false);
    h.q.want(3, true);
    await h.land(3);
    expect(h.log).toEqual(["paint 3", "release 3", "paint 3"]);
  });

  it("frees a page scrolled past WHILE it was painting, once it lands", async () => {
    const h = harness();
    h.q.want(5, true);
    h.q.want(5, false);
    expect(h.log).toEqual(["paint 5"]);
    await h.land(5);
    expect(h.log).toEqual(["paint 5", "release 5"]);
  });

  it("paints nothing after stop", async () => {
    const h = harness();
    h.q.stop();
    h.q.want(1, true);
    await flush();
    expect(h.log).toEqual([]);
  });
});
