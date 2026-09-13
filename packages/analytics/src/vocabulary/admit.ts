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
 * inflate a count that exists, never inject a property that does not. Damage limitation
 * (with the rate limits and PostHog's own billing cap) is the honest design; identity is
 * a label, `source`, and it is treated as one.
 */

/** The keys the sink stamps on EVERY event (`sink.ts` `withContext`) — context, not payload. */
export const CONTEXT_KEYS = ["env", "app_version"] as const;

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
    if (Object.prototype.hasOwnProperty.call(props, key)) properties[key] = props[key];
  }
  return { ok: true, source, event, properties };
}
