import { useEffect, useRef } from "react";
import type { Conversation } from "../types";
import { isExplicitMemoryAsk } from "../memory/extract";
import { runMemoryExtraction, type MemoryExtractionDeps } from "./memoryExtractionRun";

// La passe d'extraction elle-même (décisions, relance, signalement d'échec) vit dans
// `memoryExtractionRun.ts` — ré-exportée pour que les imports existants ne bougent pas.
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
/** Balayage au DÉMARRAGE : délai de courtoisie (l'auth/les clés se résolvent, l'app
 *  s'installe), puis rattrapage des tranches ORPHELINES — les conversations quittées
 *  avant l'idle de 120 s (app fermée, machine endormie). */
export const MEMORY_SWEEP_DELAY_MS = 45_000;
/** BORNES du balayage — le vrai risque est la rafale : une conversation d'avant la
 *  fonctionnalité a un watermark à 0, et un balayage naïf au premier lancement
 *  extrairait tout l'historique (coût surprise + rate-limit + mémoire polluée par de
 *  vieux contextes). Fenêtre de récence + plafond par démarrage + exécution en SÉRIE. */
export const MEMORY_SWEEP_MAX = 3;
export const MEMORY_SWEEP_RECENCY_MS = 7 * 24 * 3600 * 1000;

/** Les conversations qu'un balayage de démarrage peut traiter : une tranche au-delà du
 *  watermark, aucun tour en vol, actives dans la fenêtre de récence — les plus
 *  récentes d'abord, plafonnées. Pur (testé) ; le runner les traite en série. */
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
  // Trois déclencheurs (idle, blur, balayage) peuvent viser la MÊME conversation avant
  // que son watermark n'avance — l'in-flight évite le double appel modèle.
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
      // Via `fire` → le garde `inFlight` : l'appel direct d'avant pouvait doubler un
      // blur/switch-away concurrent sur la même conversation (deux appels modèle).
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

  // BLUR-FLUSH (le pattern des SDK analytics) : l'utilisateur PART — minimise, change
  // d'app, s'apprête à fermer — c'est le moment d'extraire, pendant que l'app tourne
  // encore. Couvre l'essentiel des « fermé avant les 120 s d'idle » ; jamais de travail
  // réseau à la fermeture elle-même (non déterministe). Idempotent : watermark +
  // in-flight rendent les blurs répétés gratuits.
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

  // BALAYAGE AU DÉMARRAGE : rattrape les tranches orphelines (quittées avant l'idle,
  // app fermée depuis). Une seule fois par session, après le délai de courtoisie —
  // les candidates sont lues à l'ÉCHÉANCE (les conversations chargent en async), bornées
  // (`sweepCandidates`) et traitées en SÉRIE pour ne jamais rafaler le fournisseur.
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
          /* une conversation en échec n'empêche pas les suivantes */
        } finally {
          inFlight.current.delete(conv.id);
        }
      }
    }, deps.sweepDelayMs ?? MEMORY_SWEEP_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
