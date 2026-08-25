import { useEffect, useRef } from "react";

/**
 * The shape EVERY E2E sync channel has: pull on load and on resume, push the delta
 * once a local change settles.
 *
 * Desktop and mobile each ran their own copy of this wiring for the coffre, record
 * and userdata channels — six near-identical hooks whose only real difference is how
 * the platform observes "the user came back". Everything else is correctness that
 * must not be re-decided per file: the `ready` gate, the debounce, and the fact that
 * the pull/push closures are held in refs so a re-render can't restart the timer.
 *
 * ⚠️ `ready` is not a loading nicety, and it is `store.syncReady`, NEVER bare `loaded`.
 * The push cycle TOMBSTONES local deletions (an unhydrated empty list reads as "the user
 * deleted everything") and the pull creates SKELETON conversations for ids the store
 * doesn't hold (titles without messages — the 14/08 wipe: 47 conversations emptied).
 * `loaded` is true even after a FAILED db load; `syncReady` is not (`dbWipeGuard.ts`).
 */

/** How a platform observes "the user came back to this device". Returns its own
 *  unsubscribe, so the caller never has to remember which listener it registered. */
export type ResumeSignal = (run: () => void) => () => void;

/** Desktop (Electron window): a focus event. */
export const onWindowFocus: ResumeSignal = (run) => {
  window.addEventListener("focus", run);
  return () => window.removeEventListener("focus", run);
};

/** Mobile / web: the document becoming visible again (there is no window focus when
 *  the app is backgrounded by the OS). */
export const onDocumentVisible: ResumeSignal = (run) => {
  const onVis = () => {
    if (document.visibilityState === "visible") run();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => document.removeEventListener("visibilitychange", onVis);
};

/** How long a local change must settle before its delta is pushed. One value, so a
 *  channel can't quietly become chattier than its siblings. */
export const PUSH_SETTLE_MS = 1500;

export interface SyncChannelOptions {
  /** `store.syncReady` for the CURRENT account — see the ⚠️ above. */
  ready: boolean;
  /** The platform's resume observer (`onWindowFocus` / `onDocumentVisible`). */
  resume: ResumeSignal;
  /** Fetch + merge the remote state. Called on load and on every resume. */
  pull: () => unknown;
  /** Send the local delta. Called once the `pushDeps` have settled. */
  push: () => unknown;
  /** The local state whose change should schedule a push. MUST keep a stable
   *  length across renders (it is spread into a dependency array). */
  pushDeps: readonly unknown[];
  /** Override the settle delay. Defaults to {@link PUSH_SETTLE_MS}. */
  settleMs?: number;
}

export function useSyncChannel({
  ready,
  resume,
  pull,
  push,
  pushDeps,
  settleMs = PUSH_SETTLE_MS,
}: SyncChannelOptions): void {
  // Refs, so a re-render re-uses the latest closure without re-running the effects
  // (a pull on every render, or a push timer that never fires because it restarts).
  const pullRef = useRef(pull);
  pullRef.current = pull;
  const pushRef = useRef(push);
  pushRef.current = push;
  const resumeRef = useRef(resume);
  resumeRef.current = resume;

  // Pull on load, then on every resume.
  useEffect(() => {
    if (!ready) return;
    const run = () => void pullRef.current();
    run();
    return resumeRef.current(run);
  }, [ready]);

  // Push once the local change has settled.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void pushRef.current(), settleMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settleMs, ...pushDeps]);
}
