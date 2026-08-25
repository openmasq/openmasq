import { pseudonymize, type RedactionResult } from "@openmasq/redact";
import type { Host } from "../host";
import { redactTimeoutMessage } from "./redactTimeout";
import { disabledKindsOf, effectiveRedactCategories } from "./redactionOptions";
import { coffreToForced, combinedCoffre } from "./coffre";
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
    // Le COFFRE et la dispense de NOTORIÉTÉ suivent l'envoi (audit 2026-08-10) : sans
    // eux, l'aperçu « Ce qui quittera la machine » montrait un terme du Coffre EN
    // CLAIR (l'envoi le masque — son contrat est « toujours redacted ») et masquait
    // une marque célèbre que l'envoi laisse en clair. La passe de dépôt passe par ce
    // même chemin, donc ses `replacements` (réutilisées par l'envoi) y gagnent aussi.
    // Coffre NON filtré par la notoriété, comme l'envoi (« UNFILTERED », store.ts) —
    // la notoriété n'exempte que la DÉTECTION, jamais un forcé.
    const forced = coffreToForced(combinedCoffre(settings));
    const { commercial: commercialNotoriety, people: peopleNotoriety } = notorietyForLevel(
      levelOf(effective, orgForced),
    );

    // Les moteurs "remote" et "model" sont PURGÉS de ce chemin (audit 2026-08-10) :
    // `normalizeSettings` coerce ces deux valeurs vers "local" à chaque chargement (les
    // sélecteurs ont été retirés du produit), donc ces branches étaient inatteignables —
    // et ~40 % du fichier à relire pour rien. Le moteur distant vivant est l'endpoint de
    // la gateway (apps/gateway), pas ce chemin. Ne pas les réintroduire ici.
    // Offline local engine (GLiNER) — redacted free-form PII in documents too,
    // with no LLM/network, mirroring the chat send pipeline.
    const useLocal = settings.redactEngine === "local" && !!host.detectLocalPii;
    const detectLocal = useLocal
      ? (t: string) => host.detectLocalPii!({ text: t })
      : undefined;
    // ⚠️ `mode` vient des RÉGLAGES ici, pas de la conversation : ce chemin est celui des
    // aperçus et du redaction d'un document AU DÉPÔT, qui n'ont pas de conversation. Même
    // famille de résidu que `keep`/`avoid`/`forced` ci-dessus — et il est borné par
    // `redactEngineSig` (le mode entre dans la signature, donc une carte produite dans
    // l'autre mode est périmée et le send re-détecte au lieu de la réutiliser).
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
 * Course d'un travail de redaction NON-abortable contre le Stop utilisateur et/ou un
 * timeout. Le détecteur local/model tourne en MAIN et ne s'aborte pas en vol : la course
 * JETTE son résultat (`AbortError`) — l'utilisateur voit un arrêt immédiat, le résultat
 * périmé est ignoré, le travail de fond se borne sur son propre garde-fou. `timeoutMs`
 * est ce qui rend VRAIE l'invariante que `apps/desktop` `main/localNer.ts` suppose (« le
 * renderer borne une détection à ≤45 s ») — la branche LOCALE de l'envoi ne la tenait
 * pas : le seul moteur réellement livré était aussi le seul sans borne ni signal, d'où
 * un bouton Stop mort jusqu'à 5 minutes sur un worker NER coincé (`stopEarly.test.ts`).
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
