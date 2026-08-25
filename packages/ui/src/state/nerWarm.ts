/**
 * Has the on-device NER model been warmed at least once THIS SESSION?
 *
 * One flag, two readers, and they must be the same one: `effects/usePlatformEffects.ts`
 * warms the model at mount (so the first message never pays the ~1-3 s weight load on
 * the critical path), and the send path reads it to stamp `cold` on the first
 * `redaction_timing`. Kept module-scoped rather than in state — a reload SHOULD reset it
 * (the model is cold again), and nothing re-renders on it.
 *
 * ⚠️ It lives in its own file precisely because a second copy is silent: a warm-up that
 * sets its own `let` leaves the send reading a flag nobody ever flips, so every first
 * send reports `cold` and the metric quietly stops meaning anything.
 */
let warmed = false;

export const isNerWarmed = (): boolean => warmed;
export const markNerWarmed = (): void => {
  warmed = true;
};
