import { bucket, captureEvent } from "../../analytics";
import { uid } from "../../state/storePersistence";
import { buildSendAnalyticsEvents } from "../sendAnalytics";
import type { RedactedTurn } from "./redactionPasses";
import type { RedactionSetup } from "./redactionSetup";
import type { TurnContext } from "./turnSetup";
import { mergeVault } from "../mergeVault";

/**
 * After the passes: emit the privacy-safe analytics (counts, enums, category keys, never a
 * value), patch the visible user bubble with its highlights and the model payload it
 * needs on a retry, and persist the now-mutated vault so history stays reversible.
 */
export function persistUserTurn(ctx: TurnContext, r: RedactionSetup, red: RedactedTurn): void {
  const { d, opts, text, convId, userMsg, model, forcePython, compPrompt, atPrompt } = ctx;
  const { userWire, redactedSpans, redactionFailed, memSel, memoryWire } = red;
  for (const e of buildSendAnalyticsEvents({
    provider: model.provider,
    model: model.id,
    textLength: text.length,
    matchCount: userWire.matches.length,
    useAiDetect: r.useAiDetect,
    useRemote: false,
    modelError: !!userWire.modelError,
    spanKinds: redactedSpans.map((s) => s.kind),
  })) {
    captureEvent(e);
  }

  d.patchConversation(convId, (c) => ({
    ...c,
    messages: c.messages.map((m) =>
      m.id === userMsg.id
        ? {
            ...m,
            redactions: userWire.matches.length,
            redactedSpans: redactedSpans.length ? redactedSpans : undefined,
            redactionFailed,
            // Only when the injection SUCCEEDED: a fail-closed skip must not claim it happened.
            memoryUsed: memoryWire
              ? [...(memSel.profile ? ["profile"] : []), ...memSel.cards.map((mc) => mc.id)]
              : undefined,
            memorySkipped: memSel.skipped.length ? memSel.skipped : undefined,
            // The model payload rides the message so later turns re-send the document /
            // plot directive / compétence prompt; display still uses `content`.
            modelContent: r.folded.hasFolded || forcePython || !!compPrompt || !!atPrompt ? r.folded.fullModelText : undefined,
            plotTag: forcePython ? "graphique" : undefined,
            // `prompt` is the SNAPSHOT that went out; `servers` lets the next turn's tool
            // scope pick the compétence back up. `message.workflow` is never written.
            competence: opts.competence
              ? {
                  id: opts.competence.id,
                  name: opts.competence.name,
                  prompt: compPrompt,
                  servers: opts.competence.servers?.length ? opts.competence.servers : undefined,
                }
              : undefined,
            askTarget: opts.askTarget ? { ...opts.askTarget, prompt: atPrompt } : undefined,
          }
        : m,
    ),
    redactionVault: r.vault,
    redactionSalt: r.redactionSalt,
    redactionKey: r.redactionKey,
    redactionMode: r.redactionMode,
    // The FINE category of every redacted value, on the conversation too (the Audit tab
    // reads it). The passes' kinds first, then this message's own: a typed value wins.
    redactionKinds: {
      ...c.redactionKinds,
      ...r.extraKinds,
      ...Object.fromEntries(redactedSpans.map((s) => [s.value, s.kind])),
    },
    updatedAt: Date.now(),
  }));

  storeAttachments(ctx, r);
}

/**
 * Store each attached file locally (original + redacted) in the same `files` table the
 * visible-mode injector writes to. Main redacts in place with this conversation's vault and
 * returns the merged vault + spans. Fire-and-forget: a file write never delays the send.
 */
function storeAttachments(ctx: TurnContext, r: RedactionSetup): void {
  const { d, conv, attachments, convId, dbg } = ctx;
  const { host } = d;
  if (!host.files?.redactAndSave || !attachments?.length) return;
  const fileConvId = conv.sessionConversationId || convId;
  for (const a of attachments) {
    // A re-attach carries in-memory `data`; a native pick carries a granted `path`.
    if (!a.path && !a.data) continue;
    void host.files
      .redactAndSave({
        id: uid(),
        conversationId: fileConvId,
        path: a.path,
        data: a.data,
        name: a.name,
        mime: a.mime || "application/octet-stream",
        vault: r.vault,
        disabledKinds: r.disabledKinds,
        // The drop-time count, so an image/PDF still shows its redaction badge in the library.
        redactedCount: a.redactPreview,
        // Persist the extraction so RE-ATTACHING skips OCR/parsing; `redactions` is the
        // drop-time map, frozen: it is what the Library viewer repaints.
        extraction:
          a.text || a.replacements?.length
            ? {
                text: a.text ?? "",
                ocrText: a.ocrText,
                words: a.words,
                ocrPages: a.ocrPages,
                ocr: a.ocr,
                redactions: a.replacements?.map(({ real, fake, tone, kind }) => ({ real, fake, tone, kind })),
              }
            : undefined,
      })
      .then(({ vault: merged, kinds, spans, redacted }) => {
        // Mime + a coarse FILE-size bucket + redaction count only; never the name or content.
        captureEvent({
          name: "file_attached",
          mime: a.mime || "application/octet-stream",
          sizeBucket: bucket(a.data ? Math.round(a.data.length * 0.75) : (a.text?.length ?? 0)),
          redactions: spans.length,
        });
        d.patchConversation(convId, (c) => ({
          ...c,
          redactionVault: mergeVault(c.redactionVault, merged),
          redactionKinds: { ...c.redactionKinds, ...kinds },
          fileRedactions: spans.length
            ? [...(c.fileRedactions ?? []), { name: a.name, spans, at: Date.now() }]
            : c.fileRedactions,
        }));
        // A PDF/image cannot be rewritten in place: `spans` is empty there, and the line
        // must not read "0 redacted" on the one surface the user checks.
        dbg({
          type: "tool",
          name: "document-redaction",
          ok: true,
          args: a.name,
          result:
            redacted === false
              ? `format non réinscriptible — octets d'origine conservés (chiffrés) ; le texte envoyé est redacted`
              : `${spans.length} valeurs masquées dans les octets stockés`,
        });
      })
      .catch((e) =>
        dbg({
          type: "error",
          scope: "document-redaction",
          message: `${a.name}: ${e instanceof Error ? e.message : String(e)}`,
        }),
      );
  }
}
