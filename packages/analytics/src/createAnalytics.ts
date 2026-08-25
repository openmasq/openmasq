import type { Analytics, Bucketers } from "./types";
import { makeSanitize } from "./sanitize";
import { createSink } from "./sink";

/**
 * Compose the allow-list walk + the transport into one surface API. Each app calls
 * this ONCE (a module singleton) with its own event vocabulary + id source, then
 * re-exports `{ configureAnalytics, setAnalyticsConsent, captureEvent }`.
 *
 * Vit dans son propre module plutôt que dans le tonneau : `web.ts` s'en sert, et
 * l'importer depuis `index.ts` aurait fait un cycle tonneau ⇄ module.
 */
export function createAnalytics<E extends { name: string }>(opts: {
  allowed: Record<string, readonly string[]>;
  bucketers?: Bucketers;
  getAnonId: () => string | Promise<string>;
  defaultSource?: string;
  logPrefix?: string;
}): Analytics<E> {
  const sanitize = makeSanitize<E>({ allowed: opts.allowed, bucketers: opts.bucketers });
  const t = createSink({
    getAnonId: opts.getAnonId,
    defaultSource: opts.defaultSource,
    logPrefix: opts.logPrefix,
  });
  return {
    ...t,
    sanitize,
    captureEvent: (event: E) => t.sink(sanitize(event)),
  };
}
