import { describe, expect, it } from "vitest";
import { detectLocalNer } from "@openmasq/redact";
import { cancelRuns } from "./cancelRuns";

describe("cancelRuns — the worker stops a cancelled run between chunks", () => {
  it("a run cancelled mid-document fails at its next chunk, never resolving a partial []", async () => {
    const runs = cancelRuns();
    runs.start(1);
    let chunks = 0;
    const predict = runs.guard(1, async () => {
      chunks++;
      if (chunks === 1) runs.cancel(1); // the cancel lands while chunk 1 runs
      return [];
    });
    const text = "Marie Dupont habite à Rennes. ".repeat(200); // several chunks
    await expect(
      detectLocalNer(text, predict, {
        chunkSize: 1000,
        chunkOverlap: 100,
        onError: (err) => {
          throw err;
        },
      }),
    ).rejects.toThrow(/annulée/);
    expect(chunks).toBe(1);
    runs.end(1);
    expect(runs.size()).toBe(0);
  });

  it("a cancel for a finished or unknown run leaves nothing behind, and spares other runs", async () => {
    const runs = cancelRuns();
    runs.cancel(7);
    runs.start(2);
    runs.start(3);
    runs.cancel(3);
    await expect(Promise.resolve(runs.guard(2, async () => [])("x"))).resolves.toEqual([]);
    expect(() => runs.guard(3, async () => [])("x")).toThrow(/annulée/);
    runs.end(2);
    runs.end(3);
    expect(runs.size()).toBe(0);
  });
});
