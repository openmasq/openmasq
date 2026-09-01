import type { Conversation, MemoryData, Settings } from "../../types";
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
} from "../../memory/extract";

// `pinMemoryNote` (the « retiens ça » note pinned on the reply) lives in
// `./memoryNote.ts` — extracted from here for rule 1, re-exported for importers.
export { pinMemoryNote } from "./memoryNote";
import { pinMemoryPending } from "./memoryNote";

/** Entity surfaces already in memory — handed to the prompt so the ceiling is spent on
 *  what is MISSING instead of re-stating what is known. */
function knownEntities(memoryData: MemoryData | undefined): string[] {
  return (memoryData?.cards ?? []).map((c) => c.entity).filter(Boolean);
}
import { memoryId } from "../../memory";
import { DEFAULT_MODEL_ID, findModelAny } from "../../prompt/models";
import { isAutoModelId } from "../../send/autoRoute";
import type { CompletePayload } from "../../host";
import { DEFAULT_MAX_PASSES, sweepExtraction } from "../../memory/extractSweep";
import { pushDebug } from "../debug/debug";

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
  setMemory: (fn: (m: MemoryData) => MemoryData) => void;
  patchConversation: (id: string, fn: (c: Conversation) => Conversation) => void;
  /** EXPLICIT-ask feedback: pin « N faits notés » on the conversation's last assistant
   *  message, with the ids of the cards the run CREATED (deep-link + « Annuler ») and
   *  of those it UPDATED (« fiche mise à jour », deep-link to the panel's
   *  history). The ask was explicit, so the answer must be visible — silent runs
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
    "settings" | "complete" | "setMemory" | "patchConversation" | "noteOnMessage" | "onMemoryFresh"
  >,
  opts?: { explicit?: boolean },
): Promise<number> {
  const { settings, complete } = deps;
  // `memoryAuto` gates the SILENT extraction only — an explicit « retiens que… » is
  // its own consent for that turn (see the module doc). « Sans mémoire dans cette
  // conversation » (conv.memoryOff) cuts the silent one the same way: the switch
  // promises that no memory goes in OR out of here without an explicit action.
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
  // AUTO mode: the sentinel doesn't resolve — fall back to the default (free, routed by
  // `completeRouting`) rather than skipping: « retiens que… » must work in Auto too.
  const model = findModelAny(isAutoModelId(conv.modelId) ? DEFAULT_MODEL_ID : conv.modelId);
  if (!model) {
    advance();
    return 0;
  }
  // The explicit request is announced BEFORE the model call (« Mise en mémoire… »): the
  // seconds of extraction after a « retiens que… » used to be total silence that
  // read as a dead feature. Placed AFTER all the silent exits
  // above — every remaining path ends at `noteOnMessage` → `pinMemoryNote`,
  // which replaces this state with the result.
  if (explicit) deps.patchConversation(conv.id, pinMemoryPending);
  // EXPLICIT: « retiens tout ça » most often points at the REPLY (a navigated page,
  // a list the model just produced) — the reread window therefore includes the
  // ASSISTANT turns, labeled, in the wire AND in the anti-hallucination anchor text.
  // Egress-neutral (see `wireTurns`); the silent mode stays user-only (the
  // self-reinforcement loop that `ConvSlice` documents).
  const turns: SliceTurn[] = explicit
    ? readMsgs.flatMap((m): SliceTurn[] =>
        (m.role === "user" || m.role === "assistant") && m.content
          ? [{ role: m.role, text: m.content }]
          : [],
      )
    : slice.userTexts.map((t): SliceTurn => ({ role: "user", text: t }));
  const wire = explicit ? wireTurns(turns, vault) : wireSlice(slice.userTexts, vault);
  const limit = factLimitFor(explicit);
  // BOUNDED: `host.complete` has no cancellation channel (see `chat:complete` on the
  // main side) — a promise that never resolves used to lock `inFlight` FOR LIFE for the
  // conversation (the `.finally()` of `useMemoryExtraction` never ran): no more
  // future extraction, silently. The timeout turns the hang into an
  // ordinary « unreachable » — watermark preserved, retried on the next pass, and on
  // an explicit request the user sees « réessayez » instead of nothing.
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
      // The ILLEGIBLE sibling (further down) has always been journaled — the TRANSPORT
      // failure wasn't, and the journal was misleading: entries for parsing
      // failures, NOTHING for an unreachable model (audit 13/08). Real cause, bounded
      // by the error message — never the content.
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
    // ILLEGIBLE reply (no JSON object at all — a chatty « thinking » model) ≠ « nothing to
    // retain »: ONE corrective retry, bounded, the faulty reply given as context.
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
      /* out stays null — handled by the sweep */
    }
    return out;
  };

  // A per-call ceiling must not become a per-REQUEST ceiling: when a pass
  // fills its quota, what's missing gets re-requested (`extractSweep.ts`). The silent mode
  // keeps a single pass — it asked for nothing.
  const sweep = await sweepExtraction(runPass, {
    limit,
    maxPasses: explicit ? DEFAULT_MAX_PASSES : 1,
    known: knownEntities(settings.memoire),
  });
  if (unreachable && !sweep.facts.length) {
    // Unreachable model (transient): watermark preserved, retried on a later
    // trigger — but an EXPLICIT request never fails silently.
    if (explicit) deps.noteOnMessage?.(conv.id, 0, undefined, true);
    return 0;
  }
  const parsed: Extraction | null = sweep.facts.length || sweep.profile
    ? { facts: sweep.facts, profile: sweep.profile }
    : null;
  if (!parsed) {
    // Two illegible replies at temperature 0: re-paying for the same slice in a loop won't
    // make it legible. The watermark advances, the failure is TRACED — and shown to
    // the user when they asked (never a real failure in silence).
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
  deps.setMemory((m) => mergeExtraction(m, withIds).data);
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
