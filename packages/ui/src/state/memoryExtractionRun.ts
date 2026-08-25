import type { Conversation, MemoryData, Settings } from "../types";
import {
  EXPLICIT_LOOKBACK,
  extractionPrompt,
  factLimitFor,
  mergeExtraction,
  parseExtraction,
  resolveExtraction,
  wireSlice,
  wireTurns,
  worthExtracting,
  type ConvSlice,
  type Extraction,
  type SliceTurn,
} from "../memory/extract";

// `pinMemoryNote` (la note « retiens ça » épinglée sur la réponse) vit dans
// `./memoryNote.ts` — extrait d'ici pour la règle 1, ré-exporté pour les importeurs.
export { pinMemoryNote } from "./memoryNote";
import { pinMemoryPending } from "./memoryNote";

/** Entity surfaces already in memory — handed to the prompt so the ceiling is spent on
 *  what is MISSING instead of re-stating what is known. */
function knownEntities(memoire: MemoryData | undefined): string[] {
  return (memoire?.cards ?? []).map((c) => c.entity).filter(Boolean);
}
import { memoryId } from "../memory";
import { DEFAULT_MODEL_ID, findModelAny } from "../prompt/models";
import { isAutoModelId } from "../send/autoRoute";
import type { CompletePayload } from "../host";
import { DEFAULT_MAX_PASSES, sweepExtraction } from "../memory/extractSweep";
import { pushDebug } from "./debug";

/**
 * ONE memory-extraction pass over a conversation's un-processed slice — the decision
 * flow around `memory/extract.ts` (which owns every pure rule and the tests). The hook
 * that schedules it (idle / blur / sweep timers) is `useMemoryExtraction.ts`.
 *
 * The call reads the WIRE slice (already-egressed fakes — no new PII out) with the SAME
 * model the conversation used; the result is un-redacted locally, vault-filtered,
 * secret-screened, then merged. Failure semantics, and the difference matters:
 *  - model UNREACHABLE (throw) → transient: watermark preserved, retried on a later
 *    trigger — but an EXPLICIT ask is told (`noteOnMessage` failed), never silence;
 *  - reply ILLISIBLE (no JSON at all) → one corrective retry; still illisible ⇒ the
 *    watermark advances (temperature 0: the same slice would fail identically forever),
 *    the failure is traced in the journal, and an explicit ask is told.
 */
export interface MemoryExtractionDeps {
  conversations: Conversation[];
  activeId: string | null;
  settings: Settings;
  complete: ((payload: CompletePayload) => Promise<string>) | undefined;
  setMemoire: (fn: (m: MemoryData) => MemoryData) => void;
  patchConversation: (id: string, fn: (c: Conversation) => Conversation) => void;
  /** EXPLICIT-ask feedback: pin « N faits notés » on the conversation's last assistant
   *  message, with the ids of the cards the run CREATED (deep-link + « Annuler ») and
   *  de celles qu'il a MISES À JOUR (« fiche mise à jour », deep-link vers l'historique
   *  du panneau). The ask was explicit, so the answer must be visible — silent runs
   *  stay in the debug log only. `failed` = the extraction genuinely FAILED (model
   *  unreachable, or its reply unusable after a retry) — an honest « réessayez »,
   *  distinct from count 0. */
  noteOnMessage?: (
    convId: string,
    count: number,
    createdIds?: string[],
    failed?: boolean,
    updatedIds?: string[],
  ) => void;
  /** Something was ADDED to memory (silent or explicit) — lets the shell raise the
   *  rail's « nouveau » dot so a background note is discoverable. */
  onMemoryFresh?: () => void;
  /** Test seam: idle delay override. */
  idleMs?: number;
  /** Test seam: startup-sweep delay override. */
  sweepDelayMs?: number;
}

/** Exported for tests — the hook is only the timers around this. Returns the number of
 *  facts merged. */
export async function runMemoryExtraction(
  conv: Conversation,
  deps: Pick<
    MemoryExtractionDeps,
    "settings" | "complete" | "setMemoire" | "patchConversation" | "noteOnMessage" | "onMemoryFresh"
  >,
  opts?: { explicit?: boolean },
): Promise<number> {
  const { settings, complete } = deps;
  // `memoryAuto` gates the SILENT extraction only — an explicit « retiens que… » is
  // its own consent for that turn (see the module doc). « Sans mémoire dans cette
  // conversation » (conv.memoryOff) coupe le silencieux de la même façon : l'interrupteur
  // promet qu'aucune mémoire n'entre NI ne sort d'ici sans geste explicite.
  if ((!settings.memoryAuto && !opts?.explicit) || !complete) return 0;
  if (conv.memoryOff && !opts?.explicit) return 0;
  const from = conv.memoryWatermark ?? 0;
  const msgs = conv.messages.slice(from);
  if (!msgs.length || msgs.some((m) => m.pending)) return 0;

  // An EXPLICIT ask re-reads a few messages BELOW the watermark: « retiens ça » points
  // at something said before, possibly in an already-extracted slice. Safe to re-read —
  // the merge dedups — and the watermark still only advances.
  const explicit = opts?.explicit === true;
  const readMsgs = explicit
    ? conv.messages.slice(Math.max(0, from - EXPLICIT_LOOKBACK))
    : msgs;
  const slice: ConvSlice = {
    userTexts: readMsgs.filter((m) => m.role === "user").map((m) => m.content).filter(Boolean),
    kinds: Object.fromEntries(
      readMsgs.flatMap((m) => (m.redactedSpans ?? []).map((s) => [s.value, s.kind] as const)),
    ),
  };
  // Advance the watermark EVEN when the gate says no: a slice judged not worth a call
  // now will not become worth one by being re-judged forever.
  const advance = () =>
    deps.patchConversation(conv.id, (c) => ({ ...c, memoryWatermark: c.messages.length }));
  if (!worthExtracting(slice)) {
    advance();
    return 0;
  }

  const vault = conv.redactionVault ?? {};
  // Mode AUTO : le sentinel ne résout pas — repli sur le défaut (gratuit, routé par
  // `completeRouting`) plutôt que de sauter : « retiens que… » doit marcher en Auto aussi.
  const model = findModelAny(isAutoModelId(conv.modelId) ? DEFAULT_MODEL_ID : conv.modelId);
  if (!model) {
    advance();
    return 0;
  }
  // La demande explicite s'annonce AVANT l'appel modèle (« Mise en mémoire… ») : les
  // secondes d'extraction après un « retiens que… » étaient un silence total qui se
  // lisait comme une fonctionnalité morte. Posé APRÈS toutes les sorties silencieuses
  // ci-dessus — chaque chemin restant finit par `noteOnMessage` → `pinMemoryNote`,
  // qui remplace cet état par le résultat.
  if (explicit) deps.patchConversation(conv.id, pinMemoryPending);
  // EXPLICIT: « retiens tout ça » désigne le plus souvent la RÉPONSE (une page navigée,
  // une liste que le modèle vient de produire) — la fenêtre relue inclut donc les tours
  // ASSISTANT, étiquetés, dans le wire ET dans le texte d'ancrage anti-hallucination.
  // Égress-neutre (voir `wireTurns`) ; le mode silencieux reste user-only (la boucle
  // d'auto-renforcement que `ConvSlice` documente).
  const turns: SliceTurn[] = explicit
    ? readMsgs.flatMap((m): SliceTurn[] =>
        (m.role === "user" || m.role === "assistant") && m.content
          ? [{ role: m.role, text: m.content }]
          : [],
      )
    : slice.userTexts.map((t): SliceTurn => ({ role: "user", text: t }));
  const wire = explicit ? wireTurns(turns, vault) : wireSlice(slice.userTexts, vault);
  const limit = factLimitFor(explicit);
  // BORNÉ : `host.complete` n'a pas de canal d'annulation (voir `chat:complete` côté
  // main) — une promesse qui ne se résout jamais verrouillait `inFlight` À VIE pour la
  // conversation (le `.finally()` de `useMemoryExtraction` ne tournait jamais) : plus
  // AUCUNE extraction future, silencieusement. Le timeout transforme la pendaison en
  // « unreachable » ordinaire — watermark préservé, retry au prochain passage, et sur
  // une demande explicite l'utilisateur voit « réessayez » au lieu de rien.
  const EXTRACT_CALL_TIMEOUT_MS = 60_000;
  const call = (messages: CompletePayload["messages"]) =>
    Promise.race([
      complete({ provider: model.provider, model: model.id, temperature: 0, messages }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("extraction mémoire : délai dépassé")), EXTRACT_CALL_TIMEOUT_MS),
      ),
    ]);

  // ONE extraction call, with the entities to skip. `null` = unreadable/unreachable —
  // the sweep stops on it and the caller reports below.
  let unreachable = false;
  const runPass = async (exclude: string[]) => {
    const prompt = extractionPrompt(wire, { explicit, exclude });
    let reply: string;
    try {
      reply = await call([
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ]);
    } catch (e) {
      unreachable = true;
      // Le frère ILLISIBLE (plus bas) est journalisé depuis toujours — l'échec TRANSPORT
      // ne l'était pas, et le journal induisait en erreur : des entrées pour les échecs
      // de parsing, RIEN pour un modèle injoignable (audit 13/08). Cause réelle, bornée
      // par le message d'erreur — jamais le contenu.
      pushDebug(
        {
          type: "tool",
          name: "mémoire · extraction",
          ok: false,
          error: `modèle injoignable — ${e instanceof Error ? e.message : String(e)}`,
        },
        conv.id,
      );
      return null;
    }
    let out = parseExtraction(reply, limit);
    if (out) return out;
    // Réponse ILLISIBLE (aucun objet JSON — un modèle « thinking » bavard) ≠ « rien à
    // retenir » : UNE relance corrective, bornée, la réponse fautive en contexte.
    try {
      out = parseExtraction(
        await call([
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
          { role: "assistant", content: reply.slice(-4000) },
          {
            role: "user",
            content:
              "Ta réponse n'était pas un objet JSON valide. Réponds UNIQUEMENT l'objet JSON demandé — aucune prose, aucune balise.",
          },
        ]),
        limit,
      );
    } catch {
      /* out reste null — traité par le balayage */
    }
    return out;
  };

  // Un plafond par appel ne doit pas devenir un plafond par DEMANDE : quand une passe
  // remplit son quota, on redemande ce qui manque (`extractSweep.ts`). Le mode silencieux
  // garde une passe unique — il n'a rien demandé.
  const sweep = await sweepExtraction(runPass, {
    limit,
    maxPasses: explicit ? DEFAULT_MAX_PASSES : 1,
    known: knownEntities(settings.memoire),
  });
  if (unreachable && !sweep.facts.length) {
    // Modèle injoignable (transitoire) : watermark préservé, retenté sur un déclencheur
    // ultérieur — mais une demande EXPLICITE n'échoue jamais en silence.
    if (explicit) deps.noteOnMessage?.(conv.id, 0, undefined, true);
    return 0;
  }
  const parsed: Extraction | null = sweep.facts.length || sweep.profile
    ? { facts: sweep.facts, profile: sweep.profile }
    : null;
  if (!parsed) {
    // Deux réponses illisibles à température 0 : re-payer la même tranche en boucle ne
    // la rendra pas lisible. Le watermark avance, l'échec est TRACÉ — et montré à
    // l'utilisateur quand il a demandé (jamais un échec réel en silence).
    advance();
    if (explicit) deps.noteOnMessage?.(conv.id, 0, undefined, true);
    pushDebug(
      {
        type: "tool",
        name: "mémoire · extraction auto",
        ok: false,
        args: `${slice.userTexts.length} message(s)`,
        result: "réponse du modèle illisible (aucun JSON), relance comprise — rien noté",
      },
      conv.id,
    );
    return 0;
  }
  const anchorText = turns.map((t) => t.text).join("\n");
  const resolved = resolveExtraction(parsed, vault, anchorText, {
    allowNotes: explicit,
    // Lets the resolver refuse a pseudonym the vault could not map back.
    wireText: wire,
  });
  advance();
  // PRE-mint an id per fact: which ids become NEW cards is then deterministic
  // (`mergeExtraction.createdIds`), so the feedback caption can deep-link + undo them.
  const withIds = { ...resolved, facts: resolved.facts.map((f) => ({ ...f, id: memoryId() })) };
  // Computed against the CURRENT snapshot for the caption; the store update below
  // re-merges inside the updater (pure + deterministic ids ⇒ the two agree).
  const merged = mergeExtraction(settings.memoire ?? { cards: [] }, withIds);
  // A preference (« je préfère des réponses courtes ») has no entity — it lands in the
  // PROFILE, not a card, so `facts.length` is 0. Carry the `"profile"` sentinel so the
  // caption says « Préférence enregistrée » instead of « rien retenu » for a real save
  // (the sentinel resolves to « Profil » and is filtered out of the deep-link/undo set).
  const notedIds = merged.profileChanged ? [...merged.createdIds, "profile"] : merged.createdIds;
  // An EXPLICIT ask gets feedback WHATEVER the outcome — « 0 » with no profile renders
  // as « rien de durable à retenir », which is an answer; silence is indistinguishable
  // from a failure. (A real FAILURE above says so instead: `failed`.)
  if (explicit)
    deps.noteOnMessage?.(
      conv.id,
      resolved.facts.length,
      notedIds,
      undefined,
      merged.updatedIds.length ? merged.updatedIds : undefined,
    );
  if (!resolved.facts.length && !resolved.profile) return 0;
  deps.setMemoire((m) => mergeExtraction(m, withIds).data);
  deps.onMemoryFresh?.();
  pushDebug(
    {
      type: "tool",
      name: "mémoire · extraction auto",
      ok: true,
      args: `${slice.userTexts.length} message(s)`,
      result:
        `${resolved.facts.length} fait(s)${resolved.profile ? " + profil" : ""}` +
        ` · ${sweep.passes} passe(s)${sweep.truncated ? " · tronqué (plafond de passes)" : ""}`,
    },
    conv.id,
  );
  return resolved.facts.length;
}
