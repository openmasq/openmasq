import { useEffect, useRef, useState } from "react";

/**
 * Smooths a STREAMED assistant reply so words arrive at an even cadence instead
 * of in the bursty chunks the network delivers (a slow model dumps a whole
 * sentence at once, then stalls). While `active`, the displayed slice of `full`
 * advances toward the end on a rAF loop whose speed scales with the backlog — a
 * big burst drains quickly but never machine-guns, a trickle reveals gently —
 * SNAPPED to whole-word boundaries so a half-word (or half a Markdown / redaction
 * token) never flashes at the edge. The rendered text is ALWAYS a prefix of
 * `full`, so partial-Markdown rendering behaves exactly as the live path already
 * tolerates.
 *
 * When `active` turns false (the turn settled, or a historical reply on reload)
 * it snaps to the COMPLETE text immediately — nothing is ever dropped or lagged.
 * `prefers-reduced-motion` also short-circuits to the full text (no animation).
 *
 * Re-renders happen at WORD rate (only when the snapped boundary advances), not
 * per frame, so the streaming bubble's Markdown re-parse isn't run 60×/s.
 */

const MIN_CPS = 45; // chars/sec floor — a trickle still moves
const MAX_CPS = 1100; // chars/sec ceiling — a huge burst can't machine-gun
const DRAIN = 0.42; // seconds to nominally drain the current backlog

export function useStreamReveal(full: string, active: boolean): string {
  // Reduced motion disables the whole animation — mirror `full` verbatim (decided
  // once at mount; a mid-stream OS toggle is not worth a listener here).
  const [reduce] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const animate = active && !reduce;

  const [visLen, setVisLen] = useState(() => (animate ? 0 : full.length));
  const progress = useRef(animate ? 0 : full.length); // float chars "earned"
  const visRef = useRef(visLen);
  visRef.current = visLen;
  const fullRef = useRef(full);
  fullRef.current = full;

  // Not animating (settled / historical / reduced-motion): mirror `full` exactly
  // on every change. Also clamp when a shorter target replaces a longer one
  // (regenerate reusing the id) so a stale longer prefix is never shown.
  useEffect(() => {
    if (!animate) {
      progress.current = full.length;
      if (visRef.current !== full.length) setVisLen(full.length);
      return;
    }
    if (progress.current > full.length) progress.current = full.length;
    if (visRef.current > full.length) setVisLen(full.length);
  }, [animate, full]);

  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp a long frame gap
      last = now;
      progress.current = advanceProgress(progress.current, fullRef.current.length, dt);
      const snap = revealBoundary(fullRef.current, Math.floor(progress.current));
      // Monotonic: never let the visible edge move backward (a chunk boundary can
      // split a word we'd already shown fully — clamping up avoids a flicker).
      if (snap > visRef.current) setVisLen(snap);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  if (!animate) return full;
  return full.slice(0, Math.min(visLen, full.length));
}

/**
 * The largest length ≤ `n` that ends on a word boundary, so the revealed prefix
 * never cuts a word in half. If `n` lands inside a word (both the char at `n` and
 * the one before it are non-space) it backs up to the previous whitespace. `n`
 * at/after the string end returns the full length (the trailing word is complete).
 * Pure — unit-tested.
 */
/**
 * Advance the float reveal cursor toward `target` over `dt` seconds. Speed scales
 * with the backlog (a big burst drains ~within DRAIN seconds) but is clamped to
 * [MIN_CPS, MAX_CPS] so a trickle still moves and a huge dump can't machine-gun.
 * Never overshoots the target. Pure — unit-tested.
 */
export function advanceProgress(progress: number, target: number, dt: number): number {
  if (progress >= target) return Math.min(progress, target);
  const backlog = target - progress;
  const cps = Math.min(MAX_CPS, Math.max(MIN_CPS, backlog / DRAIN));
  return Math.min(target, progress + cps * dt);
}

export function revealBoundary(s: string, n: number): number {
  if (n <= 0) return 0;
  if (n >= s.length) return s.length;
  const isSpace = (c: string) => c === " " || c === "\n" || c === "\t" || c === "\r";
  if (!isSpace(s[n]) && !isSpace(s[n - 1])) {
    let i = n;
    while (i > 0 && !isSpace(s[i - 1])) i--;
    return i;
  }
  return n;
}
