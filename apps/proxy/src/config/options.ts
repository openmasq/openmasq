// The ONE table of the proxy's options (`table.ts` holds the rows). Every way a setting can be given — a flag, an
// environment variable, a key in `~/.openmasq/proxy.json` — reads it here, and so do `--help`
// (`options.test.ts` pins that every flag is documented) and `config schema`. A setting
// that existed in the parser but not in this table would be one the file could not set and
// the schema could not describe, which is how three lists drift apart.
//
// `name` is the key in the file; `key` is the field it fills in `ProxyConfig`. They differ
// only where the flag's word is the better one to write (`disable` fills `disabledKinds`).
import type { ProxyConfig } from "./schema.js";
import { OPTIONS } from "./table.js";

export type Source = "default" | "file" | "client" | "env" | "flag";

interface Base {
  name: string;
  key: keyof ProxyConfig;
  flag?: string;
  env?: string;
  /** May the file set it? `reveal` and `json` are per-run, on purpose: one puts real values
   *  on a screen, the other turns the output into a machine's — neither is a preference. */
  file: boolean;
  /** One line, for `--help`'s synopsis and the schema's description. */
  doc: string;
}

export type Option =
  | (Base & { kind: "string" })
  | (Base & { kind: "number" })
  | (Base & { kind: "boolean"; flagSets: boolean })
  | (Base & { kind: "list" })
  | (Base & { kind: "enum"; values: readonly string[] })
  | (Base & { kind: "always" });

export { OPTIONS } from "./table.js";

export const byFlag = (flag: string): Option | undefined => OPTIONS.find((o) => o.flag === flag);
export const byName = (name: string): Option | undefined => OPTIONS.find((o) => o.name === name);

/** `Groupe Delorme:company,FR76…:iban` → forced redactions. A missing type is `name`. */
export function parseAlways(v: string): { value: string; category: string }[] {
  return splitList(v).map((entry) => {
    const at = entry.lastIndexOf(":");
    const value = at > 0 ? entry.slice(0, at).trim() : entry;
    const category = at > 0 ? entry.slice(at + 1).trim() : "name";
    if (!value) throw new Error(`--always: empty term in "${entry}"`);
    return { value, category };
  });
}

export const splitList = (v: string): string[] =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const TRUE = new Set(["1", "true", "yes", "on"]);
const FALSE = new Set(["0", "false", "no", "off"]);

/** How the option is named in an error, by where the value came from. */
const label = (o: Option, from: "env" | "file"): string =>
  from === "env" ? (o.env ?? o.name) : o.name;

/**
 * A value from a STRING source (a flag's argument or an environment variable), typed. A
 * value that is not one of the option's is an error naming the option and the choices,
 * never a silent default: `--level strcit` running at standard would be a leak.
 */
export function fromString(o: Option, raw: string, from: "flag" | "env"): unknown {
  const who = from === "flag" ? o.flag : label(o, "env");
  switch (o.kind) {
    case "string":
      return raw;
    case "number":
      return Number(raw);
    case "list":
      return splitList(raw);
    case "always":
      return parseAlways(raw);
    case "enum":
      if (!o.values.includes(raw)) throw new Error(`${who} is ${choices(o.values)}, not ${raw}`);
      return raw;
    case "boolean": {
      const v = raw.trim().toLowerCase();
      if (TRUE.has(v)) return true;
      if (FALSE.has(v)) return false;
      throw new Error(`${who} is true or false (1/0), not ${raw}`);
    }
  }
}

/** A value from the JSON file, checked against the option's kind. */
export function fromJson(o: Option, raw: unknown, where: string): unknown {
  const who = `${where}.${o.name}`;
  const strings = (v: unknown): string[] => {
    if (!Array.isArray(v) || v.some((s) => typeof s !== "string"))
      throw new Error(`${who} must be an array of strings`);
    return v as string[];
  };
  switch (o.kind) {
    case "string":
      if (typeof raw !== "string") throw new Error(`${who} must be a string`);
      return raw;
    case "number":
      if (typeof raw !== "number") throw new Error(`${who} must be a number`);
      return raw;
    case "boolean":
      if (typeof raw !== "boolean") throw new Error(`${who} must be true or false`);
      return raw;
    case "list":
      return strings(raw);
    case "enum":
      if (typeof raw !== "string" || !o.values.includes(raw))
        throw new Error(`${who} is ${choices(o.values)}, not ${JSON.stringify(raw)}`);
      return raw;
    case "always":
      // `"Groupe Delorme:company"` or `{ "value": "Groupe Delorme", "category": "company" }`.
      if (!Array.isArray(raw)) throw new Error(`${who} must be an array`);
      return raw.map((e) => {
        if (typeof e === "string") return parseAlways(e)[0];
        if (e && typeof e === "object" && typeof (e as { value?: unknown }).value === "string") {
          const { value, category } = e as { value: string; category?: unknown };
          return { value, category: typeof category === "string" ? category : "name" };
        }
        throw new Error(`${who} entries are "value:type" strings or { value, category } objects`);
      });
  }
}

export const choices = (values: readonly string[]): string =>
  values.length === 2
    ? values.join(" or ")
    : `${values.slice(0, -1).join(", ")} or ${values.at(-1)}`;

/** The closest option name to a misspelt one, for the error — or nothing when none is near. */
export function closest(
  name: string,
  among: readonly string[] = OPTIONS.map((o) => o.name),
): string | undefined {
  let best: { name: string; d: number } | undefined;
  for (const candidate of among) {
    const d = distance(name.toLowerCase(), candidate.toLowerCase());
    if (d <= 2 && (!best || d < best.d)) best = { name: candidate, d };
  }
  return best?.name;
}

/** Levenshtein, small strings only. */
function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
