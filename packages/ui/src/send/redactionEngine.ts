import { pseudonymize, type RedactionResult } from "@openmasq/redact";
import type { Host } from "../host";
import { redactTimeoutMessage } from "./redactTimeout";
import { disabledKindsOf, effectiveRedactCategories } from "./redactionOptions";
import { vaultTermsToForced, combinedVaultTerms } from "./vaultTerms";
import { levelOf, notorietyForLevel } from "../privacy/privacyLevel";
import type { Settings } from "../types";

/**
 * A pseudonymise function bound to the user's CURRENT redaction settings + host,
 * so previews (PDF viewer, attachment preview) detect free-form PII with the SAME
 * AI model the send pipeline uses — not regex-only. Returns `modelError` when the
 * model was meant to run but failed, so previews can warn instead of silently
 * leaving names unmasked.
 */
export type RedactFn = (
  text: string,
  signal?: AbortSignal,
  /** Optional SHARED vault (fake→real) so multi-chunk document redaction stays atomic
   *  + collision-free across chunks (see `@openmasq/redact` `pdfReplacements`). */
  vault?: Record<string, string>,
  /** The active conversation's category override — same precedence as the send
   *  (`effectiveRedactCategories`: global ⊕ conversation ⊕ org-forced). Absent when
   *  there is no conversation yet (e.g. the Library file viewer). */
  convCategories?: Record<string, boolean>,
) => Promise<RedactionResult>;

/**
 * Build the settings-bound {@link RedactFn} — the engine-dispatch (remote / model /
 * local / regex) pulled OUT of the React `RedactionProvider` so it is pure (no hooks,
 * no JSX) and unit-testable. `RedactionProvider` just `useMemo`s over this.
 */
export function makeRedactFn(host: Host, settings: Settings, orgForced?: string[]): RedactFn {
  return async (
    text: string,
    signal?: AbortSignal,
    vault?: Record<string, string>,
    convCategories?: Record<string, boolean>,
  ) => {
    if (!text.trim()) return { text, matches: [] };
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");

    // Respect the user's DISABLED categories on the document/preview path too (audit
    // L6): without this the engine got no `disabledKinds`, so a document was redacted
    // for EVERY category regardless of the user's toggles — over-redaction the send
    // pipeline doesn't do. Derived from the GLOBAL settings MERGED with the CALLER's
    // conversation override (when it has one) and the org's MANDATED categories,
    // exactly as the send does (`effectiveRedactCategories`): a member cannot switch an
    // org-forced category off, and this path must not be the loophole — the send REUSES
    // this map for a document, so a category dropped here reaches the provider in clear.
    // `convCategories` is undefined for callers with no conversation (the Library
    // viewer) — global settings alone then, same as before this param existed. NOTE
    // (remaining follow-up): `keep` (connected-integration names — lives in the
    // store's cache, not reachable from here; its absence only OVER-masks a
    // connector name, the fail-closed direction) and `avoid` (prior-message
    // fake-collision guard — the "france" trap) are still not threaded here.
    const effective = effectiveRedactCategories(settings.redactCategories, convCategories, orgForced);
    const disabledKinds = disabledKindsOf(effective);
    // The COFFRE and the NOTORIETY dispensation follow the send (audit 2026-08-10): without
    // them, the "Ce qui quittera la machine" preview showed a Coffre term IN
    // CLEAR (the send masks it — its contract is "always redacted") and masked
    // a famous brand that the send leaves in clear. The drop-time pass goes through this
    // same path, so its `replacements` (reused by the send) benefit too.
    // Coffre NOT filtered by notoriety, like the send ("UNFILTERED", store.ts) —
    // notoriety only exempts DETECTION, never a forced value.
    const forced = vaultTermsToForced(combinedVaultTerms(settings));
    const { commercial: commercialNotoriety, people: peopleNotoriety } = notorietyForLevel(
      levelOf(effective, orgForced),
    );

    // The "remote" and "model" engines are PURGED from this path (audit 2026-08-10):
    // `normalizeSettings` coerces both values to "local" on every load (the
    // selectors were removed from the product), so these branches were unreachable —
    // and ~40% of the file re-read for nothing. The live remote engine is the
    // gateway's endpoint (apps/gateway), not this path. Do not reintroduce them here.
    // Offline local engine (GLiNER) — redacted free-form PII in documents too,
    // with no LLM/network, mirroring the chat send pipeline.
    const useLocal = settings.redactEngine === "local" && !!host.detectLocalPii;
    const detectLocal = useLocal
      ? (t: string) => host.detectLocalPii!({ text: t })
      : undefined;
    // ⚠️ `mode` comes from SETTINGS here, not the conversation: this path is the one for
    // previews and DROP-TIME document redaction, which have no conversation. Same
    // family of residual as `keep`/`avoid`/`forced` above — and it is bounded by
    // `redactEngineSig` (the mode enters the signature, so a map produced under
    // the other mode is stale and the send re-detects instead of reusing it).
    const mode = settings.redactWireTokens ? ("token" as const) : ("fake" as const);
    const work = pseudonymize(text, {
      vault, detectLocal, numbers: false, disabledKinds, mode,
      forced, commercialNotoriety, peopleNotoriety,
    });
    if (!signal) return work;
    return raceRedactionWork(work, { signal });
  };
}

/**
 * Races a NON-abortable redaction job against the user's Stop and/or a
 * timeout. The local/model detector runs in MAIN and does not abort in flight: the race
 * DISCARDS its result (`AbortError`) — the user sees an immediate stop, the stale
 * result is ignored, the background job is bounded by its own guard. `timeoutMs`
 * is what makes TRUE the invariant `apps/desktop` `main/localNer.ts` assumes ("the
 * renderer bounds a detection to ≤45s") — the send's LOCAL branch didn't hold
 * it: the only engine actually shipped was also the only one with no bound or signal, hence
 * a dead Stop button for up to 5 minutes on a stuck NER worker (`stopEarly.test.ts`).
 */
export function raceRedactionWork<T>(
  work: Promise<T>,
  opts: { signal?: AbortSignal; timeoutMs?: number },
): Promise<T> {
  const races: Promise<T>[] = [work];
  if (opts.signal) {
    const signal = opts.signal;
    races.push(
      new Promise<T>((_, reject) =>
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
          once: true,
        }),
      ),
    );
  }
  if (opts.timeoutMs) {
    const ms = opts.timeoutMs;
    races.push(new Promise<T>((_, reject) => setTimeout(() => reject(new Error(redactTimeoutMessage(ms))), ms)));
  }
  return Promise.race(races);
}
