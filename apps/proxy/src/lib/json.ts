// Walkers over the JSON shapes both wire families share: string leaves inside tool inputs,
// JSON carried as a string (OpenAI tool-call `arguments`), text parts.

/** Map every string leaf of a JSON value (objects, arrays), depth-first, sequentially. */
export async function mapStrings(
  value: unknown,
  fn: (s: string) => Promise<string>,
): Promise<unknown> {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const v of value) out.push(await mapStrings(v, fn));
    return out;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = await mapStrings(v, fn);
    return out;
  }
  return value;
}

/** Synchronous twin, for the restore side (no engine call). */
export function mapStringsSync(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStringsSync(v, fn));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = mapStringsSync(v, fn);
    return out;
  }
  return value;
}

/**
 * A JSON document carried as a STRING (tool-call arguments): map its string leaves and
 * re-serialise. Not JSON ⇒ treated as plain text, so nothing is ever forwarded unmasked
 * because it failed to parse.
 */
export async function mapJsonString(
  str: string,
  fn: (s: string) => Promise<string>,
): Promise<string> {
  if (!str) return str;
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return fn(str);
  }
  return JSON.stringify(await mapStrings(parsed, fn));
}

export function mapJsonStringSync(str: string, fn: (s: string) => string): string {
  if (!str) return str;
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch {
    return fn(str);
  }
  return JSON.stringify(mapStringsSync(parsed, fn));
}

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
