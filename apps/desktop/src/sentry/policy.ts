/**
 * WHAT IS ALLOWED TO LEAVE IN A CRASH REPORT — decided once, for all three processes.
 *
 * ⚠️ By default the SDK captures the opposite of what this app promises (breadcrumbs with
 * URLs and clicked text, absolute paths). So, rule 7: an ALLOW list. `scrubEvent`
 * RECONSTRUCTS an event from only the fields enumerated here; a future SDK field carrying
 * content is simply not copied.
 *
 * The accepted RESIDUAL: the exception message and frame names are FREE text, so they go
 * through `scrubText` (a deny list of patterns + truncation): a mitigation, not a
 * guarantee. The real defense is upstream — never interpolate user data into an error
 * message. `policy.test.ts` pins the covered patterns.
 */

import { isOperationalError } from "@openmasq/analytics";
import { scrubText } from "./scrubText";

// Re-exported: `policy.ts` stays the one door to the scrubber.
export { scrubText };

/** Public by nature (a DSN only lets a client SEND). Default from `scripts/publicServices.ts`;
 *  EMPTY ⇒ nothing initializes, nothing leaves. */
export const SENTRY_DSN = process.env.OPENMASQ_SENTRY_DSN ?? "";

/**
 * The ENVIRONMENT, always populated. The baked channel no longer ties a build to an
 * environment (the API is chosen at runtime): this only distinguishes a CI build from a
 * local one, and states the baked channel, never a guessed env. Residual: report the REAL
 * resolved environment.
 */
export function resolveEnvironment(channel: string | undefined | null): string {
  const c = (channel ?? "").trim();
  if (!c) return "development";
  if (c.endsWith("production")) return "production";
  if (c.endsWith("staging")) return "staging";
  // An unknown channel is reported AS IS rather than forced into "production".
  return c;
}


/** A stack frame, reduced to what locates the code — never to what it was handling. */
interface CleanFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
}

/** What we accept receiving from the SDK. Deliberately loose: we only READ it. */
interface RawEvent {
  event_id?: unknown;
  timestamp?: unknown;
  platform?: unknown;
  level?: unknown;
  environment?: unknown;
  release?: unknown;
  exception?: { values?: unknown } | unknown;
  message?: unknown;
  tags?: unknown;
  fingerprint?: unknown;
  user?: unknown;
  contexts?: unknown;
  [k: string]: unknown;
}

function cleanFrames(frames: unknown): CleanFrame[] {
  if (!Array.isArray(frames)) return [];
  const out: CleanFrame[] = [];
  // The frames CLOSEST to the error are at the end: keep the tail.
  for (const f of frames.slice(-30)) {
    const r = f as Record<string, unknown>;
    out.push({
      filename: scrubText(r.filename ?? r.abs_path ?? ""),
      function: scrubText(r.function ?? ""),
      ...(typeof r.lineno === "number" ? { lineno: r.lineno } : {}),
      ...(typeof r.colno === "number" ? { colno: r.colno } : {}),
      ...(typeof r.in_app === "boolean" ? { in_app: r.in_app } : {}),
    });
    // ⚠️ `vars` and `pre_context`/`context_line`/`post_context` are NOT copied: the two
    // fields through which a real value enters a crash report.
  }
  return out;
}

/** Rebuilds the event from only the allowed fields; `null` drops it. */
export function scrubEvent(event: RawEvent | null | undefined): Record<string, unknown> | null {
  if (!event) return null;
  const out: Record<string, unknown> = {};
  // Event identity + classification: no content.
  for (const k of ["event_id", "timestamp", "platform", "level", "environment", "release"]) {
    const v = event[k];
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  // Only our own tags, and only scalars.
  if (event.tags && typeof event.tags === "object") {
    const tags: Record<string, string> = {};
    for (const [k, v] of Object.entries(event.tags as Record<string, unknown>)) {
      if (ALLOWED_TAGS.has(k) && (typeof v === "string" || typeof v === "number")) {
        tags[k] = String(v).slice(0, 80);
      }
    }
    if (Object.keys(tags).length) out.tags = tags;
  }

  const values = (event.exception as { values?: unknown } | undefined)?.values;
  if (Array.isArray(values) && values.length) {
    out.exception = {
      values: values.slice(0, 3).map((v) => {
        const r = v as Record<string, unknown>;
        const frames = (r.stacktrace as { frames?: unknown } | undefined)?.frames;
        const mech = r.mechanism as { type?: unknown; handled?: unknown } | undefined;
        return {
          type: scrubText(r.type ?? "Error"),
          value: scrubText(r.value ?? ""),
          stacktrace: { frames: cleanFrames(frames) },
          // `mechanism.handled` is a BOOLEAN, never content, and it is what populates
          // the "Unhandled" / crash-rate views.
          ...(mech && typeof mech.handled === "boolean"
            ? { mechanism: { type: scrubText(mech.type ?? "generic"), handled: mech.handled } }
            : {}),
        };
      }),
    };
  } else if (typeof event.message === "string") {
    out.message = scrubText(event.message);
  } else {
    // Neither exception nor message: nothing usable is left, so we don't send.
    return null;
  }
  // `fingerprint`: strings WE set (`[scope, code]`). Scalars, scrubbed, ≤ 5.
  if (Array.isArray(event.fingerprint)) {
    const fp = (event.fingerprint as unknown[])
      .filter((f): f is string => typeof f === "string")
      .slice(0, 5)
      .map((f) => scrubText(f));
    if (fp.length) out.fingerprint = fp;
  }
  // `user.id` ALONE: the anonymous UUID from `installErrorReporting` — never IP/email/name.
  const user = event.user as { id?: unknown } | undefined;
  if (user && typeof user.id === "string" && /^[0-9a-f-]{1,40}$/.test(user.id)) {
    out.user = { id: user.id };
  }
  // `contexts` field by field, never as a block: os.name/version + device.arch locate a
  // platform failure. ⚠️ `device.name`/`device.model` (often the user's first name) NEVER pass.
  const ctx = event.contexts as { os?: Record<string, unknown>; device?: Record<string, unknown> } | undefined;
  if (ctx && typeof ctx === "object") {
    const os: Record<string, string> = {};
    if (typeof ctx.os?.name === "string") os.name = scrubText(ctx.os.name);
    if (typeof ctx.os?.version === "string") os.version = scrubText(ctx.os.version);
    const device: Record<string, string> = {};
    if (typeof ctx.device?.arch === "string") device.arch = scrubText(ctx.device.arch);
    const contexts: Record<string, unknown> = {};
    if (Object.keys(os).length) contexts.os = os;
    if (Object.keys(device).length) contexts.device = device;
    if (Object.keys(contexts).length) out.contexts = contexts;
  }
  // ⚠️ `breadcrumbs`, `request`, `extra`, `modules`, `server_name` and the REST of
  // `user`/`contexts` are NEVER copied: they carry the machine's name, visited URLs and
  // the text of clicked elements.
  return out;
}

/**
 * WHAT ISN'T WORTH SENDING: the ONE predicate from `@openmasq/analytics` (operational
 * failures — a connector down, an expired refresh, an offline machine — are not bugs, and
 * a drowned crash channel is useless). ⚠️ An UNCAUGHT crash is never discarded: the
 * predicate's own `fatal` rule, recognized by the `scope: "uncaught"` tag or `handled: false`.
 */
function isUncaught(event: RawEvent): boolean {
  if (event.level === "fatal") return true;
  const tags = event.tags as Record<string, unknown> | undefined;
  if (tags && tags.scope === "uncaught") return true;
  const first = (event.exception as { values?: unknown } | undefined)?.values;
  const mech = Array.isArray(first)
    ? ((first[0] as Record<string, unknown> | undefined)?.mechanism as
        | { handled?: unknown }
        | undefined)
    : undefined;
  return mech?.handled === false;
}

function isOperationalNoise(event: RawEvent | null | undefined): boolean {
  if (!event) return false;
  const values = (event.exception as { values?: unknown } | undefined)?.values;
  const first = Array.isArray(values) ? (values[0] as Record<string, unknown> | undefined) : undefined;
  const name = typeof first?.type === "string" ? first.type : undefined;
  const message =
    typeof first?.value === "string"
      ? first.value
      : typeof event.message === "string"
        ? event.message
        : undefined;
  if (!name && !message) return false;
  return isOperationalError({
    // `scope`/`code` aren't used for the verdict — the type requires them.
    scope: "sentry",
    code: "before-send",
    name,
    message,
    fatal: isUncaught(event),
  });
}

/**
 * Anti-flood cap per SIGNATURE (truncated type+message), per session; uncaught has a
 * higher cap (a crash loop is what we want to see, but not hundreds of times).
 */
const MAX_PER_SIGNATURE = 5;
const MAX_PER_SIGNATURE_UNCAUGHT = 20;
const sentSignatures = new Map<string, number>();

function overSignatureCap(event: RawEvent): boolean {
  const values = (event.exception as { values?: unknown } | undefined)?.values;
  const first = Array.isArray(values) ? (values[0] as Record<string, unknown> | undefined) : undefined;
  const sig = `${String(first?.type ?? "")}·${String(first?.value ?? event.message ?? "").slice(0, 120)}`;
  const n = (sentSignatures.get(sig) ?? 0) + 1;
  sentSignatures.set(sig, n);
  return n > (isUncaught(event) ? MAX_PER_SIGNATURE_UNCAUGHT : MAX_PER_SIGNATURE);
}

/**
 * `beforeSend`, whole and in a single place for all three processes: discard operational
 * noise and flooding, then RECONSTRUCT what's left.
 */
export function sentryBeforeSend(event: RawEvent | null | undefined): Record<string, unknown> | null {
  if (!event) return null;
  if (isOperationalNoise(event)) return null;
  if (overSignatureCap(event)) return null;
  return scrubEvent(event);
}

/** The tags WE set — everything else is discarded. `scope`/`code` are bounded
 *  enumerations (`runtime/errorReport.ts`); `event.process` is set by the SDK on a RELAYED
 *  event and names the faulty process. */
const ALLOWED_TAGS = new Set(["process", "channel", "packaged", "build", "scope", "code", "event.process"]);
