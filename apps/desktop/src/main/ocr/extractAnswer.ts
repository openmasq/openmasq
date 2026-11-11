import type { ExtractedFile } from "@openmasq/redact/documents";

/**
 * The extraction worker's FINAL answer, rebuilt before main uses it. The worker is ours, but
 * what it read is the FILE's, and a file that took a parser over answers whatever it likes: so
 * the answer is never passed on as received. It is rebuilt from an ALLOW-list of fields, each
 * of its type and under a cap, its nested geometry copied as plain data under one budget
 * (no prototype keys, no object that is not a plain one, a bounded depth); anything else is
 * dropped, and an answer that is not of the expected shape is refused whole (`null`: the file is
 * in error, fail closed). The preview stream has its own check (`extractStream.ts`).
 */

/** everything a document's answer may hold, strings and nodes together */
const MAX_CHARS = 128 * 1024 * 1024;
const MAX_NODES = 4_000_000;
const MAX_DEPTH = 12;

interface Budget {
  chars: number;
  nodes: number;
}
const budget = (): Budget => ({ chars: MAX_CHARS, nodes: MAX_NODES });
const BAD = Symbol("refused");

/** A copy of plain data (strings, finite numbers, booleans, null, arrays, plain objects), or BAD. */
function plain(v: unknown, b: Budget, depth = 0): unknown {
  if (--b.nodes < 0 || depth > MAX_DEPTH) return BAD;
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : BAD;
  if (typeof v === "string") return (b.chars -= v.length) < 0 ? BAD : v;
  if (Array.isArray(v)) {
    const out: unknown[] = [];
    for (const x of v) {
      const c = plain(x, b, depth + 1);
      if (c === BAD) return BAD;
      out.push(c);
    }
    return out;
  }
  if (typeof v !== "object" || Object.getPrototypeOf(v) !== Object.prototype) return BAD;
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [k, x] of Object.entries(v)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") return BAD;
    if (x === undefined) continue;
    const c = plain(x, b, depth + 1);
    if (c === BAD) return BAD;
    out[k] = c;
  }
  return { ...out };
}

const str = (v: unknown, max: number, b: Budget): v is string => typeof v === "string" && v.length <= max && (b.chars -= v.length) >= 0;

/** A document read by the worker: its known fields only, or null when it is not one. */
export function checkExtracted(raw: unknown): ExtractedFile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const b = budget();
  if (!str(r.name, 4096, b) || !str(r.kind, 64, b) || !str(r.text, MAX_CHARS, b)) return null;
  if (typeof r.chars !== "number" || !Number.isFinite(r.chars) || r.chars < 0) return null;
  const out: Record<string, unknown> = { name: r.name, kind: r.kind, text: r.text, chars: r.chars };
  const strings: [string, number][] = [["error", 4000], ["errorCode", 64], ["rawCause", 8000], ["mime", 255], ["ocrText", MAX_CHARS]];
  for (const [key, max] of strings) {
    if (r[key] === undefined) continue;
    if (!str(r[key], max, b)) return null;
    out[key] = r[key];
  }
  if (r.blocked !== undefined) {
    if (typeof r.blocked !== "boolean") return null;
    out.blocked = r.blocked;
  }
  // `path` is the caller's to set, never the worker's (it is handed bytes, not a path): dropped
  for (const key of ["errorParams", "words", "ocr", "textPages", "ocrPages"]) {
    if (r[key] === undefined) continue;
    const copy = plain(r[key], b);
    if (copy === BAD) return null;
    out[key] = copy;
  }
  return out as unknown as ExtractedFile;
}

const record = (v: unknown, b: Budget): Record<string, string> | null => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === "__proto__" || !str(k, 100_000, b) || !str(x, 100_000, b)) return null;
    out[k] = x;
  }
  return out;
};

/** The in-place scrub's answer (`inplaceScrub.ts`, its bytes as base64), or null when it is not one. */
export function checkInplace(raw: unknown): { scrubbed: string | null; vault: Record<string, string>; kinds: Record<string, string>; spans: { value: string; kind: string }[] } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const b = budget();
  if (r.scrubbed !== null && !str(r.scrubbed, MAX_CHARS, b)) return null;
  const vault = record(r.vault, b);
  const kinds = record(r.kinds, b);
  if (!vault || !kinds || !Array.isArray(r.spans) || r.spans.length > 1_000_000) return null;
  const spans: { value: string; kind: string }[] = [];
  for (const s of r.spans as { value?: unknown; kind?: unknown }[]) {
    if (!s || !str(s.value, 100_000, b) || !str(s.kind, 64, b)) return null;
    spans.push({ value: s.value, kind: s.kind });
  }
  return { scrubbed: r.scrubbed as string | null, vault, kinds, spans };
}
