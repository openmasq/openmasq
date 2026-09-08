import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openNerCache } from "./nerCache";

const file = () => join(mkdtempSync(join(tmpdir(), "nercache-")), "ner.ndjson");

describe("openNerCache — the bench's inference cache", () => {
  it("runs the model once per distinct text, then serves it", async () => {
    const f = file();
    let calls = 0;
    const model = async (t: string) => { calls++; return [{ entity: "B-PER", word: t, score: 0.9 }]; };
    const piped = openNerCache(f, "m|q8|rev").wrap(model);
    expect(await piped("Ninon Verdolini")).toEqual([{ entity: "B-PER", word: "Ninon Verdolini", score: 0.9 }]);
    await piped("Ninon Verdolini");
    await piped("someone else");
    expect(calls).toBe(2);
  });
  it("survives the process — a second run reads what the first wrote", async () => {
    const f = file();
    let calls = 0;
    const model = async () => { calls++; return [{ entity: "B-LOC", score: 0.5 }]; };
    await openNerCache(f, "m|q8|rev").wrap(model)("Blagnac");
    const second = openNerCache(f, "m|q8|rev");
    expect(await second.wrap(model)("Blagnac")).toEqual([{ entity: "B-LOC", score: 0.5 }]);
    expect(calls).toBe(1);
    expect(second.stats()).toMatchObject({ hits: 1, misses: 0 });
  });
  it("a different fingerprint starts the file over — never a stale prediction", async () => {
    const f = file();
    await openNerCache(f, "m|q8|revA").wrap(async () => ["A"])("x");
    let calls = 0;
    const other = openNerCache(f, "m|q8|revB");
    expect(await other.wrap(async () => { calls++; return ["B"]; })("x")).toEqual(["B"]);
    expect(calls).toBe(1);
    expect(readFileSync(f, "utf8").split("\n")[0]).toBe("m|q8|revB");
  });
  it("a truncated or interleaved line is skipped, never trusted", async () => {
    const f = file();
    writeFileSync(f, "m|q8|rev\n{\"k\":\"abc\",\"v\":[1]}\n{\"k\":\"trunc\",\"v\":[\n");
    let calls = 0;
    const c = openNerCache(f, "m|q8|rev");
    await c.wrap(async () => { calls++; return ["fresh"]; })("whatever");
    expect(calls).toBe(1);
    expect(c.stats().entries).toBe(2); // the one good line, plus the one just written
  });
  it("hands each caller its own copy — one pass cannot mutate what the next reads", async () => {
    const f = file();
    const piped = openNerCache(f, "m|q8|rev").wrap(async () => [{ entity: "B-PER", score: 0.9 }]);
    const first = (await piped("Ninon")) as { entity: string }[];
    first[0].entity = "MUTATED";
    expect((await piped("Ninon")) as unknown).toEqual([{ entity: "B-PER", score: 0.9 }]);
  });
  it("OPENMASQ_BENCH_NER_CACHE=0 gives the pipeline back untouched", async () => {
    process.env.OPENMASQ_BENCH_NER_CACHE = "0";
    try {
      let calls = 0;
      const piped = openNerCache(file(), "m|q8|rev").wrap(async () => { calls++; return []; });
      await piped("x"); await piped("x");
      expect(calls).toBe(2);
    } finally {
      delete process.env.OPENMASQ_BENCH_NER_CACHE;
    }
  });
});
