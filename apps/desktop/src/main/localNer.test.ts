import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A superseded preview CANCELS its local NER run: the pending call rejects (never a
 * partial `[]` — every caller fails closed on a rejection) and the worker is told to stop,
 * so a stale long document stops competing with the next run or the send for the CPU.
 */
type Listener = (msg: unknown) => void;
const posted: unknown[] = [];
let onMessage: Listener = () => {};
const child = {
  on: (ev: string, cb: Listener) => {
    if (ev === "message") onMessage = cb;
  },
  postMessage: (m: unknown) => posted.push(m),
  kill: () => {},
  stderr: null,
};
vi.mock("electron", () => ({
  app: { isPackaged: false },
  utilityProcess: { fork: () => child },
}));
vi.mock("./runtime/errorReport", () => ({ reportMainError: () => {} }));
vi.mock("./runtime/quitState", () => ({ isAppQuitting: () => false }));

const { detectLocalPii, cancelLocalPii } = await import("./localNer");

describe("localNer — cancelling a run", () => {
  beforeEach(() => {
    posted.length = 0;
  });

  it("rejects the pending call and tells the worker to stop", async () => {
    const run = detectLocalPii({ text: "Marie Dupont", cancelKey: "k-1" });
    await Promise.resolve();
    const { id } = posted[0] as { id: number };
    cancelLocalPii("k-1");
    await expect(run).rejects.toThrow(/annulée/);
    expect(posted[1]).toEqual({ cancel: id });
    // The worker's late answer for that run finds nothing to resolve.
    onMessage({ id, ok: true, detections: [{ value: "x", category: "name" }] });
  });

  it("ignores a malformed or unknown key, and never touches another run", async () => {
    const run = detectLocalPii({ text: "Paul Martin", cancelKey: "k-2" });
    await Promise.resolve();
    const { id } = posted[0] as { id: number };
    cancelLocalPii({ evil: true });
    cancelLocalPii("../../etc");
    cancelLocalPii("k-unknown");
    expect(posted).toHaveLength(1);
    onMessage({ id, ok: true, detections: [] });
    await expect(run).resolves.toEqual([]);
    // Once settled, the key is spent: a late cancel does nothing.
    cancelLocalPii("k-2");
    expect(posted).toHaveLength(1);
  });

  it("a run without a key cannot be cancelled by anyone", async () => {
    const run = detectLocalPii({ text: "Jean Morvan" });
    await Promise.resolve();
    const { id } = posted[0] as { id: number };
    cancelLocalPii("undefined");
    onMessage({ id, ok: true, detections: [] });
    await expect(run).resolves.toEqual([]);
  });
});
