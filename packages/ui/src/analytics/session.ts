/**
 * The analytics SESSION: the `$session_id` the sink stamps (`@openmasq/analytics`
 * `getSessionId`), from which PostHog derives session count and duration — the "app closed
 * vs app idle" question, with no quit hook (the renderer that owns the transport is the one
 * dying at quit, so an `app_close` would be lost exactly when it matters).
 *
 * A session ends after `IDLE_MS` without a USER event; the next one opens a new id. The
 * main process's update funnel (`update_*`) runs on a timer whether anyone is there or not:
 * it carries no session and refreshes none, or an app left open would be one endless session.
 *
 * The id is a UUIDv7 (PostHog's sessions table requires the time-ordered form), random,
 * ephemeral, never persisted: it links nothing `distinct_id` does not already link.
 */
export const IDLE_MS = 30 * 60_000;

let current: { id: string; last: number } | null = null;

const isBackground = (event: string): boolean => event.startsWith("update_");

export function sessionIdFor(event: string, now: number = Date.now()): string | undefined {
  if (isBackground(event)) return undefined;
  if (!current || now - current.last > IDLE_MS) current = { id: uuidv7(now), last: now };
  else current.last = now;
  return current.id;
}

/** RFC 9562 v7: 48-bit Unix ms, version 7, variant 10, the rest random. */
export function uuidv7(now: number): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Tests only. */
export function __resetSessionForTests(): void {
  current = null;
}
