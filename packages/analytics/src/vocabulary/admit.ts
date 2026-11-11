import { reduceMessage } from "../errorTracking";
import { VOCABULARY, type Source } from "./index";

/**
 * The relay's ADMISSION rule — what `POST /e` lets through to PostHog, decided here so the
 * rule is one pure function the relay imports and this package tests.
 *
 * Why a rule and not a wall: nothing shipped to a machine the user controls can prove
 * which SOFTWARE sent a request — a baked key, static or rotating, is extractable from the
 * bundle, and a session proves a person, not a program. So the relay does not try to
 * authenticate the sender; it limits what a sender can DO. An envelope is admitted only if
 * its `source` is a declared surface, its `event` is in that surface's vocabulary (or
 * `$exception`, whose shape is fixed), and only the DECLARED keys survive — a forger can
 * inflate a count that exists, never inject a property that does not — nor a VALUE of a shape
 * the sink never sends: a declared key keeps a primitive or a short `string[]`, bounded in
 * length, and an `$exception_list` is REBUILT as the one `{type, value, mechanism}` entry
 * the sink builds, its message through `reduceMessage`. Damage limitation
 * (with the rate limits and PostHog's own billing cap) is the honest design; identity is
 * a label, `source`, and it is treated as one.
 */

/** The keys the sink stamps on events (`sink.ts` `withContext`) — context, not payload. */
export const CONTEXT_KEYS = ["env", "app_version", "$session_id"] as const;

/** The fixed shape of an `$exception` built by `sink.ts` `captureError`. */
export const EXCEPTION_KEYS = ["$exception_list", "scope", "code", "fatal", "name", "status"] as const;

export const EXCEPTION_EVENT = "$exception";

export interface AdmitInput {
  source?: unknown;
  event?: unknown;
  properties?: unknown;
}

export type Admission =
  | { ok: true; source: Source; event: string; properties: Record<string, unknown> }
  | { ok: false; reason: "source" | "event" };

export function isSource(v: unknown): v is Source {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(VOCABULARY, v);
}

/** Admit one envelope, or say which gate refused it. Never throws on any input shape. */
export function admit(input: AdmitInput): Admission {
  if (!isSource(input.source)) return { ok: false, reason: "source" };
  const source = input.source;
  const event = input.event;
  if (typeof event !== "string" || !event) return { ok: false, reason: "event" };

  const vocabulary: Record<string, readonly string[]> = VOCABULARY[source];
  let allowed: readonly string[];
  if (event === EXCEPTION_EVENT) allowed = EXCEPTION_KEYS;
  else if (Object.prototype.hasOwnProperty.call(vocabulary, event)) allowed = vocabulary[event];
  else return { ok: false, reason: "event" };

  const raw = input.properties;
  const props: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const properties: Record<string, unknown> = {};
  for (const key of [...allowed, ...CONTEXT_KEYS]) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    const value = key === EXCEPTION_LIST ? exceptionList(props[key], props) : admitValue(props[key]);
    if (value !== undefined) properties[key] = value;
  }
  return { ok: true, source, event, properties };
}

const EXCEPTION_LIST = "$exception_list";
/** The longest string a declared key keeps; the sink's values are codes and buckets. */
export const MAX_VALUE_CHARS = 200;
/** The most entries a `string[]` keeps. */
export const MAX_LIST_ITEMS = 50;

/** What the sanitise walk can produce (`sanitize.ts`): a primitive or a `string[]`, bounded.
 *  Anything else (an object, a nested array, a non-finite number) is dropped. */
function admitValue(v: unknown): unknown {
  if (typeof v === "string") return v.slice(0, MAX_VALUE_CHARS);
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
    return v.slice(0, MAX_LIST_ITEMS).map((x) => (x as string).slice(0, MAX_VALUE_CHARS));
  }
  return undefined;
}

/**
 * The ONE entry `sink.ts` `captureError` builds, rebuilt field by field. The message is the
 * sink's own default (`scope: code`), else whatever `reduceMessage` lets through — which is
 * the identity on what an honest sink sent, and a fingerprint on anything else.
 */
function exceptionList(v: unknown, props: Record<string, unknown>): unknown[] {
  const first = Array.isArray(v) ? (v[0] as Record<string, unknown> | null | undefined) : undefined;
  if (!first || typeof first !== "object" || Array.isArray(first)) return [];
  const type = typeof first.type === "string" && /^[\w$.-]{1,80}$/.test(first.type) ? first.type : "Error";
  const raw = typeof first.value === "string" ? first.value : "";
  const own = typeof props.scope === "string" && typeof props.code === "string" && raw === `${props.scope}: ${props.code}`;
  const value = own ? raw.slice(0, MAX_VALUE_CHARS) : reduceMessage(raw);
  const mech = first.mechanism as { handled?: unknown } | null | undefined;
  return [{ type, value, mechanism: { handled: mech?.handled === true, type: "generic" } }];
}
