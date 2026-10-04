import type { Host } from "@openmasq/ui";

/**
 * The host's `detectLocalPii`, with its `signal` carried across the bridge: an AbortSignal
 * cannot cross `contextBridge`, so the run is named by a random key and an abort asks main
 * to stop it (`cancelLocalPii`). The run then REJECTS — the preview drops it, and a send
 * would fail closed. Absent API ⇒ the local engine is unavailable.
 */
export function localPiiDetector(): Host["detectLocalPii"] {
  const api = window.openmasq;
  if (!api.detectLocalPii) return undefined;
  return (payload, signal) => {
    if (!signal) return api.detectLocalPii(payload);
    if (signal.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
    const cancelKey = crypto.randomUUID();
    const onAbort = () => api.cancelLocalPii(cancelKey);
    signal.addEventListener("abort", onAbort, { once: true });
    return api.detectLocalPii({ ...payload, cancelKey }).finally(() => signal.removeEventListener("abort", onAbort));
  };
}
