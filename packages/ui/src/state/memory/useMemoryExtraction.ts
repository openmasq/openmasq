import { useEffect, useRef } from "react";
import type { Conversation } from "../../types";
import { isExplicitMemoryAsk } from "../../memory/extract";
import { runMemoryExtraction, type MemoryExtractionDeps } from "./memoryExtractionRun";

// The extraction pass itself (decisions, retry, failure reporting) lives in
// `memoryExtractionRun.ts` — re-exported so existing imports don't move.
export { runMemoryExtraction, type MemoryExtractionDeps } from "./memoryExtractionRun";

/**
 * AUTOMATIC memory extraction — the TIMERS around `memoryExtractionRun.ts`.
 * `settings.memoryAuto` (default OFF) gates the SILENT extraction only; an EXPLICIT ask
 * (« retiens que… ») is its own consent for that turn and runs regardless — the user
 * just asked, refusing silently reads as a broken feature. Either way the call reads
 * the WIRE slice (already-egressed fakes — no new PII out), so the opt-in is about
 * silent WRITES to memory, never about egress.
 *
 * Trigger: an ARMED IDLE TIMER per completed turn on the active conversation, plus a
 * flush when the user switches away from it.
 */
export const MEMORY_IDLE_MS = 120_000;
/** STARTUP sweep: a courtesy delay (auth/keys resolve, the app
 *  settles), then catch-up of ORPHANED slices — conversations left
 *  before the 120 s idle (app closed, machine asleep). */
export const MEMORY_SWEEP_DELAY_MS = 45_000;
/** Sweep BOUNDS — the real risk is the burst: a conversation from before the
 *  feature has a watermark at 0, and a naive sweep on first launch
 *  would extract the entire history (surprise cost + rate-limit + memory polluted by
 *  old contexts). Recency window + per-startup cap + SERIAL execution. */
export const MEMORY_SWEEP_MAX = 3;
export const MEMORY_SWEEP_RECENCY_MS = 7 * 24 * 3600 * 1000;

/** The conversations a startup sweep may process: a slice past the
 *  watermark, no turn in flight, active within the recency window — the most
 *  recent first, capped. Pure (tested); the runner processes them in series. */
export function sweepCandidates(conversations: Conversation[], now: number): Conversation[] {
  return conversations
    .filter(
      (c) =>
        c.messages.length > (c.memoryWatermark ?? 0) &&
        !c.messages.some((m) => m.pending) &&
        now - c.updatedAt <= MEMORY_SWEEP_RECENCY_MS,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MEMORY_SWEEP_MAX);
}

export function useMemoryExtraction(deps: MemoryExtractionDeps): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const prevActive = useRef<string | null>(null);
  // Three triggers (idle, blur, sweep) can target the SAME conversation before
  // its watermark advances — the in-flight guard avoids the double model call.
  const inFlight = useRef(new Set<string>());

  const convById = (id: string | null) =>
    depsRef.current.conversations.find((c) => c.id === id);

  const fire = (id: string | null, opts?: { explicit?: boolean }) => {
    const conv = convById(id);
    if (!conv || inFlight.current.has(conv.id)) return;
    inFlight.current.add(conv.id);
    void runMemoryExtraction(conv, depsRef.current, opts)
      .catch(() => {})
      .finally(() => inFlight.current.delete(conv.id));
  };

  // Arm the idle timer whenever the ACTIVE conversation gains a completed turn past
  // the watermark; any newer activity re-arms it.
  const active = deps.conversations.find((c) => c.id === deps.activeId);
  const activeLen = active?.messages.length ?? 0;
  const activeSettled = !!active && activeLen > (active.memoryWatermark ?? 0) && !active.messages.some((m) => m.pending);
  useEffect(() => {
    if (!activeSettled) return;
    if (timer.current) clearTimeout(timer.current);
    const id = deps.activeId;
    // EXPLICIT fast path: the just-landed user message asked to remember → extract as
    // soon as the turn settles (a short beat for the persistence flush), no idle wait.
    // Runs even with `memoryAuto` OFF — the explicit ask is its own consent.
    const lastUser = [...(active?.messages ?? [])].reverse().find((m) => m.role === "user");
    const explicit = !!lastUser && isExplicitMemoryAsk(lastUser.content);
    if (explicit) {
      // Via `fire` → the `inFlight` guard: the previous direct call could double up a
      // concurrent blur/switch-away on the same conversation (two model calls).
      timer.current = setTimeout(() => fire(id, { explicit: true }), 800);
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }
    // SILENT idle extraction stays opt-in.
    if (!deps.settings.memoryAuto) return;
    timer.current = setTimeout(() => fire(id), deps.idleMs ?? MEMORY_IDLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps.settings.memoryAuto, deps.activeId, activeLen, activeSettled, deps.idleMs]);

  // Switching away flushes the conversation being left immediately.
  useEffect(() => {
    const prev = prevActive.current;
    prevActive.current = deps.activeId;
    if (prev && prev !== deps.activeId && deps.settings.memoryAuto) fire(prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps.activeId]);

  // BLUR-FLUSH (the analytics-SDK pattern): the user is LEAVING — minimizing, switching
  // apps, about to close — this is the moment to extract, while the app is still
  // running. Covers most of the "closed before the 120 s idle" cases; never network
  // work at close itself (non-deterministic). Idempotent: watermark +
  // in-flight make repeated blurs free.
  useEffect(() => {
    const flush = () => {
      if (!depsRef.current.settings.memoryAuto) return;
      fire(depsRef.current.activeId);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // STARTUP SWEEP: catches up orphaned slices (left before the idle,
  // app closed since). Once per session, after the courtesy delay —
  // candidates are read at DEADLINE (conversations load async), bounded
  // (`sweepCandidates`) and processed in SERIES so as never to burst the provider.
  const swept = useRef(false);
  useEffect(() => {
    if (swept.current) return;
    swept.current = true;
    const t = setTimeout(async () => {
      const d = depsRef.current;
      if (!d.settings.memoryAuto || !d.complete) return;
      for (const conv of sweepCandidates(d.conversations, Date.now())) {
        if (inFlight.current.has(conv.id)) continue;
        inFlight.current.add(conv.id);
        try {
          await runMemoryExtraction(conv, depsRef.current);
        } catch {
          /* a failed conversation doesn't block the following ones */
        } finally {
          inFlight.current.delete(conv.id);
        }
      }
    }, deps.sweepDelayMs ?? MEMORY_SWEEP_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
