import { strict as assert } from "node:assert";
import { test } from "vitest";
import { frame, TOO_LARGE, Unframer } from "./frames";

test("messages cross as frames, whole, in order, however the pipe cuts them", () => {
  const messages = [{ id: 1, kind: "mail", bytes: new Uint8Array([1, 2, 3]) }, { ready: true }, { id: 2, ok: false, code: "refused", message: "é ✓" }];
  const stream = Buffer.concat(messages.map(frame));
  for (const size of [1, 3, 7, 64, stream.length]) {
    const reader = new Unframer();
    const got: unknown[] = [];
    for (let i = 0; i < stream.length; i += size) got.push(...reader.push(stream.subarray(i, i + size)));
    assert.deepEqual(got, messages, `chunks of ${size}`);
  }
});

test("what JSON has no form for crosses too: bytes, typed arrays, dates, maps, sets, undefined", () => {
  const sent = {
    pdf: Buffer.from("%PDF-1.7"),
    picture: new Uint8Array([0, 255, 7]).subarray(1),
    vectors: new Float32Array([0.5, -1.25, 3]),
    ids: new BigInt64Array([1n, -2n]),
    date: new Date("2026-10-18T10:00:00Z"),
    seen: new Map([["a", 1]]),
    kinds: new Set(["email"]),
    nothing: undefined,
    list: [undefined, null, 1],
    big: 12345678901234567890n,
  };
  const [got] = new Unframer().push(frame(sent)) as [typeof sent];
  assert.ok(Buffer.isBuffer(got.pdf));
  assert.equal(got.pdf.toString(), "%PDF-1.7");
  assert.deepEqual([...got.picture], [255, 7]);
  assert.ok(got.vectors instanceof Float32Array);
  assert.deepEqual([...got.vectors], [0.5, -1.25, 3]);
  assert.deepEqual([...got.ids], [1n, -2n]);
  assert.equal(got.date.toISOString(), "2026-10-18T10:00:00.000Z");
  assert.deepEqual([...got.seen], [["a", 1]]);
  assert.deepEqual([...got.kinds], ["email"]);
  assert.ok("nothing" in got && got.nothing === undefined);
  assert.deepEqual(got.list, [undefined, null, 1]);
  assert.equal(got.big, 12345678901234567890n);
});

test("what else reaches the pipe is skipped, and a damaged frame is dropped", () => {
  const reader = new Unframer();
  const noise = Buffer.from("Warning: TT: undefined function\nMDK\u0002 not a frame\n", "latin1");
  const damaged = frame({ id: 9 });
  damaged[damaged.length - 1] ^= 0xff;
  const got = reader.push(Buffer.concat([noise, frame({ id: 1 }), noise, damaged, frame({ id: 2 })]));
  assert.deepEqual(got, [{ id: 1 }, { id: 2 }]);
});


test("a frame that comes in many chunks is joined once and read whole, the next one after it", () => {
  const reader = new Unframer();
  const big = frame({ id: 1, text: "x".repeat(300_000) });
  const all = Buffer.concat([big, frame({ id: 2 })]);
  const got: unknown[] = [];
  for (let at = 0; at < all.length; at += 4096) got.push(...reader.push(all.subarray(at, at + 4096)));
  assert.equal(got.length, 2);
  assert.equal((got[0] as { text: string }).text.length, 300_000);
  assert.deepEqual(got[1], { id: 2 });
});

test("a frame larger than its reader accepts is said at once, never kept, and the next frame is read", () => {
  const reader = new Unframer(1024);
  const big = frame({ id: 1, text: "x".repeat(50_000) });
  // said on its first bytes, before the rest has come
  assert.deepEqual(reader.push(big.subarray(0, 64)), [TOO_LARGE]);
  assert.deepEqual(reader.push(Buffer.concat([big.subarray(64), frame({ id: 2 })])), [{ id: 2 }]);
});
