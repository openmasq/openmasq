/**
 * Messages between main and a worker started as a plain Node (`../ocr/extractSandbox.ts`), over
 * that worker's stdin and stdout: the one channel every jail passes (`sandbox-exec`, the Windows
 * launcher `<slug>-jail.exe`, which hands the child its std handles and nothing else).
 *
 * The encoding does not depend on either side's V8: main runs on Electron's, the worker on the
 * Node shipped beside the app (`scripts/bake-node.ts`), and V8's own serialization refuses data
 * from a newer V8 than its own. A message is JSON for its shape, its binary parts (bytes, typed
 * arrays) sent raw after it, and a few tagged values JSON has no form for (Date, Map, Set,
 * undefined, BigInt).
 *
 * Each message is framed: a mark, its length and its CRC-32. What else reaches the pipe (a
 * library writing to stdout) is skipped up to the next mark, and a frame whose bytes do not
 * match its CRC is dropped: the job it carried times out like any lost answer.
 */
import { crc32 } from "node:zlib";

const MARK = Buffer.from("OMQ\u0002", "latin1");
const HEAD = 12;
/** a message larger than this is refused (a document and its text fit well under it) */
const MAX_FRAME = 512 * 1024 * 1024;
/** the key a tagged value carries: no message of this app's has it */
const TAG = "\u0000md";

type Tagged = { [TAG]: string; [k: string]: unknown };
const TYPED: Record<string, new (buffer: ArrayBuffer) => ArrayBufferView> = {
  Uint8Array, Int8Array, Uint8ClampedArray, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array,
};

function pack(v: unknown, bins: Uint8Array[]): unknown {
  if (v === undefined) return { [TAG]: "undefined" };
  if (typeof v === "bigint") return { [TAG]: "bigint", v: v.toString() };
  if (v === null || typeof v !== "object") return v;
  if (ArrayBuffer.isView(v)) {
    bins.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    return { [TAG]: "bin", t: Buffer.isBuffer(v) ? "Buffer" : v.constructor.name, i: bins.length - 1 };
  }
  if (v instanceof ArrayBuffer) {
    bins.push(new Uint8Array(v));
    return { [TAG]: "bin", t: "ArrayBuffer", i: bins.length - 1 };
  }
  if (v instanceof Date) return { [TAG]: "date", v: v.getTime() };
  if (v instanceof Map) return { [TAG]: "map", v: [...v].map((e) => pack(e, bins)) };
  if (v instanceof Set) return { [TAG]: "set", v: [...v].map((e) => pack(e, bins)) };
  if (v instanceof Error) return { [TAG]: "error", name: v.name, message: v.message };
  if (Array.isArray(v)) return v.map((x) => pack(x, bins));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = pack(x, bins);
  return out;
}

function unpack(v: unknown, bins: Uint8Array[]): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => unpack(x, bins));
  const tag = (v as Tagged)[TAG];
  if (tag === undefined) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = unpack(x, bins);
    return out;
  }
  const t = v as Tagged;
  switch (tag) {
    case "undefined":
      return undefined;
    case "bigint":
      return BigInt(t.v as string);
    case "date":
      return new Date(t.v as number);
    case "map":
      return new Map((t.v as unknown[]).map((e) => unpack(e, bins)) as [unknown, unknown][]);
    case "set":
      return new Set((t.v as unknown[]).map((e) => unpack(e, bins)));
    case "error":
      return Object.assign(new Error(String(t.message)), { name: String(t.name) });
    case "bin": {
      const bytes = bins[t.i as number] ?? new Uint8Array();
      // a copy of its own: aligned, and never a view on the frame's buffer
      const copy = new Uint8Array(bytes);
      if (t.t === "Buffer") return Buffer.from(copy.buffer);
      if (t.t === "ArrayBuffer") return copy.buffer;
      const Typed = TYPED[t.t as string];
      return Typed ? new Typed(copy.buffer) : copy;
    }
    default:
      return v;
  }
}

export function frame(message: unknown): Buffer {
  const bins: Uint8Array[] = [];
  const json = Buffer.from(JSON.stringify(pack(message, bins)), "utf8");
  const parts: Uint8Array[] = [u32(json.length), json, u32(bins.length)];
  for (const b of bins) parts.push(u32(b.byteLength), b);
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(HEAD);
  MARK.copy(head, 0);
  head.writeUInt32LE(body.length, 4);
  head.writeUInt32LE(crc32(body), 8);
  return Buffer.concat([head, body]);
}

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
};

function decode(body: Buffer): unknown {
  let at = 0;
  const read = () => {
    const n = body.readUInt32LE(at);
    at += 4;
    return n;
  };
  const jsonLength = read();
  const json = body.subarray(at, at + jsonLength).toString("utf8");
  at += jsonLength;
  const bins: Uint8Array[] = [];
  for (let i = read(); i > 0; i--) {
    const n = read();
    bins.push(body.subarray(at, at + n));
    at += n;
  }
  return unpack(JSON.parse(json), bins);
}

/** What `Unframer.push` hands over in place of a frame larger than its reader accepts. */
export const TOO_LARGE = Symbol("frame too large");

/**
 * Reads frames out of a stream's chunks, in order. A frame begun and not all there yet keeps its
 * chunks as they come and joins them ONCE (joining at every chunk copied a large answer again
 * and again, on main's thread). `limit` is what THIS reader accepts (an answer's cap, below the
 * format's own): a larger frame is said at once (`TOO_LARGE`) and its bytes dropped as they come.
 */
export class Unframer {
  private buffer: Buffer = Buffer.alloc(0);
  private pending: { parts: Buffer[]; size: number; need: number } | null = null;

  constructor(private readonly limit: number = MAX_FRAME) {}

  push(chunk: Buffer): unknown[] {
    if (this.pending) {
      this.pending.parts.push(chunk);
      this.pending.size += chunk.length;
      if (this.pending.size < this.pending.need) return [];
      this.buffer = Buffer.concat(this.pending.parts, this.pending.size);
      this.pending = null;
    } else this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const out: unknown[] = [];
    for (;;) {
      const at = this.buffer.indexOf(MARK);
      if (at < 0) {
        // keep what could be the start of a mark split across chunks
        this.buffer = this.buffer.subarray(Math.max(0, this.buffer.length - (MARK.length - 1)));
        return out;
      }
      if (at > 0) this.buffer = this.buffer.subarray(at);
      if (this.buffer.length < HEAD) return out;
      const length = this.buffer.readUInt32LE(4);
      if (length > Math.min(this.limit, MAX_FRAME)) {
        this.buffer = this.buffer.subarray(MARK.length);
        if (length <= MAX_FRAME) out.push(TOO_LARGE);
        continue;
      }
      if (this.buffer.length < HEAD + length) {
        this.pending = { parts: [this.buffer], size: this.buffer.length, need: HEAD + length };
        this.buffer = Buffer.alloc(0);
        return out;
      }
      const body = this.buffer.subarray(HEAD, HEAD + length);
      if (crc32(body) !== this.buffer.readUInt32LE(8)) {
        // not a frame after all (a mark inside other bytes): look past this mark
        this.buffer = this.buffer.subarray(MARK.length);
        continue;
      }
      this.buffer = this.buffer.subarray(HEAD + length);
      try {
        out.push(decode(body));
      } catch {
        // a frame that does not decode is dropped, like a corrupted one
      }
    }
  }
}
