import { describe, expect, it } from "vitest";
import { parseFrame, serializeFrame, SseTransform, type SseFrame } from "./sse";

const collect = (t: SseTransform, chunks: string[]): Promise<string> =>
  new Promise((resolve) => {
    let out = "";
    t.on("data", (c: Buffer) => (out += c.toString("utf8")));
    t.on("end", () => resolve(out));
    for (const c of chunks) t.write(Buffer.from(c));
    t.end();
  });

describe("SSE frames", () => {
  it("parses event + multi-line data, and serialises back", () => {
    const f = parseFrame('event: ping\ndata: {"a":1}\ndata: more');
    expect(f).toEqual({ event: "ping", data: '{"a":1}\nmore' });
    expect(serializeFrame(f as SseFrame)).toBe('event: ping\ndata: {"a":1}\nmore\n\n');
  });

  it("re-assembles frames cut across chunks and CRLF, and rewrites each once", async () => {
    const seen: string[] = [];
    const t = new SseTransform((f) => {
      seen.push(f.data);
      return [{ ...f, data: f.data.toUpperCase() }];
    });
    const out = await collect(t, ["data: he", "llo\r\n\r\ndata: wor", "ld\n\n"]);
    expect(seen).toEqual(["hello", "world"]);
    expect(out).toBe("data: HELLO\n\ndata: WORLD\n\n");
  });

  it("emits the end frames after a stream that ends mid-frame", async () => {
    const t = new SseTransform(
      (f) => [f],
      () => [{ data: "tail" }],
    );
    const out = await collect(t, ["data: a\n\n", "data: b"]);
    expect(out).toBe("data: a\n\ndata: b\n\ndata: tail\n\n");
  });

  it("passes a frame without data (a comment) through untouched", async () => {
    const t = new SseTransform(() => [{ data: "never" }]);
    expect(await collect(t, [": keep-alive\n\n"])).toBe(": keep-alive\n\n");
  });
});
