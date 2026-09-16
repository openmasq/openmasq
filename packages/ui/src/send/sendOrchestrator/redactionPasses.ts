import { pseudonymize, type RedactionMatch } from "@openmasq/redact";
import { filterNotoriousFromForced, memoryForcedForBlock, selectMemory } from "../../memory";
import { logWireMessage } from "../../state/debug/wireTrace";
import { attachmentDetectBlock } from "../attachmentLayers";
import { raceRedactionWork } from "../redactionEngine";
import { applyRestore } from "../redactionPreview";
import { redactNumbersOn } from "../redactNumbers";
import { redactTimeoutMs } from "../redactTimeout";
import { describeRedactFailure } from "../redaction";
import { appendReusedDocsWire } from "../reusedDocsWire";
import { deriveRedactedSpans, type RedactedSpan } from "../sendAnalytics";
import { redactEngineUnavailable } from "../sendGuards";
import type { FailClosed } from "./failClosed";
import type { RedactionSetup, Wire } from "./redactionSetup";
import type { TurnContext } from "./turnSetup";

/** Trace label of the memory injection step (debug console). */
const MEMORY_TRACE = "mémoire · injection";

type MemorySelection = ReturnType<typeof selectMemory>;

/** The outcome of the three detection passes: what the model will see of this message. */
export interface RedactedTurn {
  userWire: Wire;
  redactedSpans: RedactedSpan[];
  /** value → kind including THIS send's fresh spans (`convKinds` alone is empty on a first message). */
  turnKinds: Record<string, string>;
  redactionFailed: ReturnType<typeof describeRedactFailure> | undefined;
  wireDebugId: string;
  memSel: MemorySelection;
  /** The redacted mémoire block actually injected, "" when skipped or failed. */
  memoryWire: string;
}

/**
 * Runs the detection passes in order: the mémoire block FIRST (its forced entities land
 * in the vault so the typed text replays the same fakes), then the attachments' extra
 * layers (detection-only, never sent), then the user message. Every pass is stoppable and
 * fails CLOSED. Returns null when the user stopped or cancelled at the preview.
 */
export async function runRedactionPasses(
  ctx: TurnContext,
  r: RedactionSetup,
  failClosed: FailClosed,
): Promise<RedactedTurn | null> {
  const { d, conv, opts, text, attachments, convId, dbg, sendAbort, stoppedEarly, userMsg, assistantMsg } = ctx;
  const { host, settings } = d;
  const { vault, engineCtx, useLocal, useAiDetect, detectLocalFn, recordKinds } = r;
  const notoriety = { commercial: r.commercialNotoriety, people: r.peopleNotoriety };
  const detect = (block: string, extra: { forced?: typeof r.forcedList; secrets?: string[]; numbers: boolean }) =>
    raceRedactionWork(
      pseudonymize(block, {
        vault,
        reFakeExisting: true,
        detectLocal: useLocal ? detectLocalFn : undefined,
        ...extra,
        ...engineCtx,
      }),
      { signal: sendAbort.signal, timeoutMs: redactTimeoutMs(block) },
    );

  // MÉMOIRE: selected client-side on REAL values, re-redacted through this conversation's
  // engine+vault+salt; its entities ride `forced` so the injection is protected even under
  // the regex engine. Fail-closed = SKIP the injection: nothing egresses.
  let memoryWire = "";
  const memSel: MemorySelection = conv.memoryOff
    ? { profile: undefined, cards: [], block: "", skipped: [] }
    : selectMemory({
        text,
        convValues: [...Object.values(vault), ...Object.keys(r.convKinds)],
        memory: settings.memoire,
      });
  const memForced = filterNotoriousFromForced(memoryForcedForBlock(memSel, settings.memoire), notoriety);
  if (memSel.block) {
    try {
      const mres = await detect(memSel.block, { forced: memForced, numbers: false });
      if (!(useAiDetect && mres.modelError)) {
        memoryWire = mres.text;
        recordKinds(mres.matches as RedactionMatch[]);
      }
      if (memoryWire) {
        dbg({
          type: "tool",
          name: MEMORY_TRACE,
          ok: true,
          args: `${memSel.cards.length} fiche(s)${memSel.profile ? " + profil" : ""}`,
          result: `${memoryWire.length} car. (redacted)`,
        });
      }
    } catch (e) {
      memoryWire = "";
      dbg({ type: "tool", name: MEMORY_TRACE, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (stoppedEarly()) return null;

  // The chosen AI engine has no detector on THIS host: block rather than run regex-only.
  const missingEngine = redactEngineUnavailable(settings.redactEngine, host);
  if (missingEngine === "local") failClosed("moteur « IA locale » indisponible sur cet appareil");
  if (missingEngine === "model") failClosed("moteur de détection « modèle » indisponible (aucun fournisseur configuré)");

  // Attachments' extra layers (OCR, hybrid reading) vaulted BEFORE the message pass, so a
  // value visible only in the page image is replaced in the wire by the vault replay.
  const layersBlock = attachmentDetectBlock(attachments);
  if (layersBlock) {
    try {
      const lres = await detect(layersBlock, { numbers: false });
      if (useAiDetect && lres.modelError) failClosed(`détection des couches document échouée (${lres.modelError})`);
      recordKinds(lres.matches as RedactionMatch[]);
      dbg({
        type: "tool",
        name: "redaction · couches document",
        ok: true,
        args: `${(attachments ?? []).length} pièce(s)`,
        result: `${layersBlock.length} car. détectés (OCR/hybride)`,
      });
    } catch (e) {
      // A Stop aborts the pass and arrives here: the user, not an outage.
      if (stoppedEarly()) return null;
      failClosed(e instanceof Error ? e.message : String(e));
    }
  }
  if (stoppedEarly()) return null;

  let userWire: Wire;
  try {
    // The user's OWN message: a value equal to an existing fake is their REAL value, so it
    // gets a distinct fake instead of being dropped (`reFakeExisting`).
    userWire = await detect(r.folded.modelText, {
      secrets: r.extraSecrets,
      forced: r.forcedList,
      numbers: useAiDetect ? redactNumbersOn(settings) : false,
    });
  } catch (e) {
    if (stoppedEarly()) return null;
    return failClosed(e instanceof Error ? e.message : String(e));
  }
  // `pseudonymize` degrades a detector throw to regex; the AI guarantee is not downgraded silently.
  if (useAiDetect && userWire.modelError) failClosed(`détection locale échouée (${userWire.modelError})`);

  // Reused documents: applied DETERMINISTICALLY from their drop-time fakes, never re-detected.
  userWire = appendReusedDocsWire(userWire, r.folded.reuseParts, vault, r.wireExclude);
  if (stoppedEarly()) return null;

  // Pre-send preview: the user reviews the EXACT wire and can un-redact spans; instant, no model call.
  const previewMatches = userWire.matches as RedactionMatch[];
  if (opts.reviewWire && previewMatches.length > 0) {
    const decision = await opts.reviewWire({ wire: userWire.text, vault, matches: previewMatches });
    if (!decision) {
      d.patchConversation(convId, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== userMsg.id && m.id !== assistantMsg.id),
      }));
      d.setIsStreaming(false);
      return null;
    }
    if (decision.restoreTokens.length) {
      const restored = new Set(decision.restoreTokens);
      userWire = {
        ...userWire,
        text: applyRestore(userWire.text, vault, decision.restoreTokens),
        matches: previewMatches.filter((m) => !restored.has(m.placeholder)),
      };
    }
  }

  // The `wire` log entry always goes out (a « Votre avis » report embeds it); only the
  // console trace is behind the developer toggle. Its id receives the token cost later.
  const wireDebugId = logWireMessage(
    { model: ctx.model.id, text: userWire.text, vault, kinds: r.convKinds, convId },
    { toConsole: !!settings.debugLog },
  );

  const redactedSpans = deriveRedactedSpans(userWire.matches as RedactionMatch[]);
  const turnKinds: Record<string, string> = { ...r.convKinds, ...r.extraKinds };
  for (const sp of redactedSpans) turnKinds[sp.value] = sp.kind;
  const redactionFailed =
    useAiDetect && userWire.modelError ? describeRedactFailure(userWire.modelError, settings.redactEngine) : undefined;

  return { userWire, redactedSpans, turnKinds, redactionFailed, wireDebugId, memSel, memoryWire };
}
