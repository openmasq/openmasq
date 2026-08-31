/**
 * WHAT IS ALLOWED TO LEAVE FOR SENTRY — the decision, made once, for all three
 * processes (main + helpers, renderer, utilities).
 *
 * ⚠️ By default, Sentry is the exact opposite of what this app promises. It captures
 * exception messages, breadcrumbs (console, network requests with their URLs, DOM
 * clicks with the element's TEXT), absolute paths — in an app where an agent
 * browser URL carries real data, where a console can print a real value,
 * and where a file path contains the user's name.
 *
 * So, rule 7: **an ALLOW list, never a deny list.** `scrubEvent` doesn't "strip"
 * anything — it RECONSTRUCTS an event from only the fields enumerated here. A future SDK
 * that adds a field carrying content then has nothing to re-neutralize: it's
 * simply not copied over.
 *
 * The accepted RESIDUAL, stated plainly: the exception message and frame names are
 * FREE text — they can't be allow-listed field by field. So they go through
 * `scrubText`, which is, itself, a deny list of patterns (emails, personal paths,
 * URL queries, long digit runs) followed by a TRUNCATION. This is a mitigation,
 * not a guarantee: a message that interpolated a value of an unforeseen shape
 * would get through. The real defense is upstream — never interpolate user data into
 * an error message. `policy.test.ts` pins the covered patterns.
 */

import { isOperationalError } from "@openmasq/analytics";

/** The only network entry point of this file. Public by nature but tied to ONE
 *  Sentry account: never committed anymore — supplied at BUILD time (`OPENMASQ_SENTRY_DSN`, baked by
 *  `scripts/buildDefines.ts`). Empty ⇒ `initSentry*` doesn't initialize: nothing leaves. */
export const SENTRY_DSN = process.env.OPENMASQ_SENTRY_DSN ?? "";

/**
 * The ENVIRONMENT, always populated.
 *
 * ⚠️ Since the single-artifact principle, `VITE_UPDATES_CHANNEL` NO LONGER ties a build to an
 * environment: CI bakes `desktop-stable` everywhere (`release.yml` says why) and the joined
 * API is chosen at runtime. This field now only distinguishes a CI build from a local
 * one (`development` — information, not a default). Tracked residual: report the REAL
 * resolved environment; in the meantime the label states the baked channel, never a guessed env.
 */
export function resolveEnvironment(channel: string | undefined | null): string {
  const c = (channel ?? "").trim();
  if (!c) return "development";
  if (c.endsWith("production")) return "production";
  if (c.endsWith("staging")) return "staging";
  // An unknown channel is reported AS IS rather than forced into "production":
  // getting the environment wrong sends you looking for a bug where it isn't.
  return c;
}

/** Max length of a kept free-text string. A useful error message fits within it;
 *  beyond that, you're copying content, not describing a failure. */
const MAX_TEXT = 300;

/**
 * Neutralizes the most likely forms of personal data in free text,
 * then truncates. See the residual documented at the top of the file.
 */
export function scrubText(input: unknown): string {
  if (typeof input !== "string" || !input) return "";
  return (
    input
      // A personal path carries the user's name (`/Users/first.last/…`,
      // `C:\Users\…`, `/home/…`) — we keep the DEPTH, which locates the file.
      .replace(/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^/\\\s)'"]+/g, "~")
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[courriel]")
      // Everything after a `?` or a `#` in a URL: that's where the agent
      // browser's search queries travel, so real values.
      .replace(/(https?:\/\/[^\s?#'"]*)[?#][^\s'"]*/g, "$1")
      // A run of 6+ digits: IBAN, card, phone number, SIREN, identifier.
      .replace(/\d[\d\s.-]{5,}\d/g, "[nombre]")
      .slice(0, MAX_TEXT)
  );
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
  // The frames CLOSEST to the error are at the end of the array in Sentry: we keep
  // the tail, which is what explains the failure.
  for (const f of frames.slice(-30)) {
    const r = f as Record<string, unknown>;
    out.push({
      filename: scrubText(r.filename ?? r.abs_path ?? ""),
      function: scrubText(r.function ?? ""),
      ...(typeof r.lineno === "number" ? { lineno: r.lineno } : {}),
      ...(typeof r.colno === "number" ? { colno: r.colno } : {}),
      ...(typeof r.in_app === "boolean" ? { in_app: r.in_app } : {}),
    });
    // ⚠️ `vars` (local variables) and `pre_context`/`context_line`/`post_context` (the SOURCE
    // CODE around the line) are NOT copied over: these are the two fields through
    // which a real value enters a crash report.
  }
  return out;
}

/**
 * Rebuilds the event from only the allowed fields. Returns `null` to
 * drop it — nothing is sent then.
 */
export function scrubEvent(event: RawEvent | null | undefined): Record<string, unknown> | null {
  if (!event) return null;
  const out: Record<string, unknown> = {};
  // Event identity + classification: no content.
  for (const k of ["event_id", "timestamp", "platform", "level", "environment", "release"]) {
    const v = event[k];
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  // Only our own tags (set by `initSentry`), and only if they are
  // scalars — a tag of unknown origin doesn't pass.
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
          // `mechanism.handled` is a BOOLEAN, never content — and it's what
          // populates Sentry's "Unhandled"/crash-rate views, structurally empty
          // without this copy-through (audit 13/08).
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
  // `fingerprint`: strings that WE set (`[scope, code]`) — splits synthesized
  // errors into distinct issues. Scalars, scrubbed, ≤ 5.
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
  // `contexts` field by field, never as a block: os.name/os.version + device.arch are what
  // distinguishes the product's two most expensive failure classes (missing VC++ on
  // a fresh Windows, Intel .app with no ONNX engine). ⚠️ `device.name`/`device.model` (the machine's
  // name = often the first name) NEVER pass through.
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
  // ⚠️ `breadcrumbs`, `request`, `extra`, `modules`, `server_name` — and all the REST of
  // `user`/`contexts` — are NEVER copied over. `server_name` is the machine's name
  // (so often the user's first name); `breadcrumbs` carries visited URLs and the
  // text of clicked elements; `contexts.device.name/model` identify the device.
  return out;
}

/**
 * WHAT ISN'T WORTH SENDING — the other half of `beforeSend`.
 *
 * The predicate is NOT rewritten here: it's the one from `@openmasq/analytics`, already applied
 * to PostHog's `$exception` channel by `captureError`. It was custom-built — a
 * remote connector going down, an expired token refresh, an offline machine:
 * operational failures, not bugs. Sentry had never received it, and the result
 * showed in the dashboard: **1590 of 1710 events (93%) were two MCP
 * transport messages**, exactly the proportion the analytics doc had measured on
 * the other channel. A drowned crash channel is no longer useful — that's the bug.
 *
 * ⚠️ An UNCAUGHT crash is never discarded, whatever its text: that's the rule
 * of the predicate itself (`fatal`), and we pass it the information instead of re-deciding it.
 * Our two uncaught funnels are recognized by the `scope: "uncaught"` tag
 * (`main/runtime/errorReport.ts`) or by the SDK's mechanism (`handled: false`).
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
 * Anti-flood cap, the Sentry counterpart of PostHog's `MAX_PER_SIGNATURE`: a reconnection
 * loop rejecting the same error 500 times burned the quota without learning anything
 * more. Per SIGNATURE (truncated type+message), per session; uncaught has a higher
 * cap — a crash loop is precisely what we want to see, but not 500 times.
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
 * `beforeSend`, whole and in a single place: we discard operational noise and
 * flooding, then RECONSTRUCT what's left. All three processes call it — it used to be
 * `scrubEvent` copied into each `init`, and a filter added to just one of them would only have
 * held there.
 */
export function sentryBeforeSend(event: RawEvent | null | undefined): Record<string, unknown> | null {
  if (!event) return null;
  if (isOperationalNoise(event)) return null;
  if (overSignatureCap(event)) return null;
  return scrubEvent(event);
}

/** The tags WE set — everything else is discarded. */
// `scope`/`code` come from `runtime/errorReport.ts`: bounded enumerations
// ("updates", "mcp", "uncaught"…), the same kind the analytics allow
// list already lets through. Truncated like the others.
// `event.process`: set by the Electron SDK on a RELAYED event (renderer→main,
// child) — without it, a renderer event arrived tagged `process: app` (main's
// scope, applied to the relay) and the faulty process was unreadable.
const ALLOWED_TAGS = new Set(["process", "channel", "packaged", "scope", "code", "event.process"]);
