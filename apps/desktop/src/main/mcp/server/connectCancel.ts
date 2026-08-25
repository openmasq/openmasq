import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-connect cancellation for the interactive "Connexion…" state.
 *
 * `withConnect(id, run)` runs one interactive connect under a fresh `AbortSignal`
 * carried AMBIENTLY (AsyncLocalStorage), so the deep OAuth loopback / GitHub device
 * window can react to a cancel WITHOUT threading a signal through every flow
 * (`connectRemote` → `startLoopback`, `googleLogin`, `microsoftLogin`, …). The store
 * propagates across `await`s, so a loopback created several awaits deep still sees it.
 *
 * `cancelConnect(id)` aborts that signal. The security-relevant teardown is that the
 * loopback CLOSES and its pending code promise REJECTS: once the 127.0.0.1 listener is
 * gone, a late browser redirect lands on a closed port, so **no `code` can be captured
 * and no token minted** — the connect then rejects and leaves nothing connected
 * (fail-closed). We cannot close the EXTERNAL browser tab, but that doesn't matter:
 * closing the loopback is the whole lever.
 *
 * Silent (startup) reconnects run OUTSIDE a scope, so `connectSignal()` is `undefined`
 * there — nothing is cancellable, which is correct: they never prompt and never hang
 * on a login.
 */
const als = new AsyncLocalStorage<{ id: string; signal: AbortSignal }>();

/** id → the controller of the interactive connect currently in flight for that id. */
const inflight = new Map<string, AbortController>();

/** Run an interactive connect for `id` under a cancellation scope. */
export function withConnect<T>(id: string, run: () => Promise<T>): Promise<T> {
  // Never two interactive connects in flight for one id — a re-click supersedes the
  // older attempt (aborts it) so it can't leak a second loopback/window.
  inflight.get(id)?.abort();
  const ctrl = new AbortController();
  inflight.set(id, ctrl);
  return als.run({ id, signal: ctrl.signal }, run).finally(() => {
    // Only clear if we're still the current attempt (a superseding connect owns it now).
    if (inflight.get(id) === ctrl) inflight.delete(id);
  });
}

/** The ambient signal of the connect running on this async stack, if any. */
export function connectSignal(): AbortSignal | undefined {
  return als.getStore()?.signal;
}

/** The id of the interactive connect running on this async stack, if any — used to
 *  attribute the OAuth authorize URL to the connector the renderer is connecting. */
export function connectId(): string | undefined {
  return als.getStore()?.id;
}

/** Cancel an in-flight interactive connect for `id`. No-op if none is running. */
export function cancelConnect(id: string): void {
  inflight.get(id)?.abort();
}
