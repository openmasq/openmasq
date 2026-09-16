import type { McpAgentParams } from "../../agent/mcpAgent";
import { bytesToBase64 } from "../../state/files/bytes";
import { uid } from "../../state/storePersistence";
import { pickAttachmentMetas } from "../sendGuards";
import type { RedactionSetup } from "./redactionSetup";
import type { TurnContext } from "./turnSetup";

/**
 * Resolve file names the model wants to ATTACH to the ORIGINAL bytes of the conversation's
 * local files. Name match ONLY, a miss returns nothing: a "fall back to every stored file"
 * branch would let a prompt-injected model exfiltrate every document via the user's own
 * account. The resolved set is also shown in the write-confirmation card.
 */
export function makeResolveAttachments(ctx: TurnContext): NonNullable<McpAgentParams["resolveAttachments"]> {
  const { d, conv, convId } = ctx;
  const { host } = d;
  return async (names) => {
    if (!host.db?.listFiles || !host.db?.loadFile) return [];
    const fileConvId = conv.sessionConversationId || convId;
    const metas = await host.db.listFiles(fileConvId).catch(() => []);
    if (!metas.length) return [];
    const picked = pickAttachmentMetas(metas, names);
    const out: { filename: string; mimeType: string; contentBase64: string }[] = [];
    for (const m of picked) {
      const f = await host.db.loadFile!(m.id).catch(() => null);
      if (!f?.original?.length) continue;
      out.push({ filename: f.name, mimeType: f.mime, contentBase64: bytesToBase64(f.original) });
    }
    return out;
  };
}

/**
 * A tool returned a downloadable file URL (already stripped from the model's view): fetch
 * it in main, redact + store it like a user attachment, pin a chip (inline when an image).
 * A failed fetch means the file exists for NOBODY, and the trace says so.
 */
export function makeOnExportedFile(ctx: TurnContext, r: RedactionSetup): NonNullable<McpAgentParams["onExportedFile"]> {
  const { d, conv, convId, assistantMsg } = ctx;
  const { host, t } = d;
  return async (url, mime) => {
    if (!host.files?.fetchUrl || !host.files?.redactAndSave) return;
    const fileConvId = conv.sessionConversationId || convId;
    try {
      const f = await host.files.fetchUrl(url);
      const { vault: merged, kinds, spans } = await host.files.redactAndSave({
        id: uid(),
        conversationId: fileConvId,
        path: f.path,
        name: f.name,
        mime: f.mime || mime,
        vault: r.vault,
        disabledKinds: r.disabledKinds,
      });
      const attMime = f.mime || mime;
      const attKind = attMime.startsWith("image/") ? "image" : "file";
      d.patchConversation(convId, (c) => ({
        ...c,
        redactionVault: merged,
        redactionKinds: { ...c.redactionKinds, ...kinds },
        messages: c.messages.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, attachments: [...(m.attachments ?? []), { name: f.name, kind: attKind, mime: attMime }] }
            : m,
        ),
        fileRedactions: spans.length
          ? [...(c.fileRedactions ?? []), { name: f.name, spans, at: Date.now() }]
          : c.fileRedactions,
      }));
    } catch {
      d.patchConversation(convId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                toolCalls: [
                  ...(m.toolCalls ?? []),
                  { tool: "export", server: "web", ok: false, note: t.errors.exportedFileLost },
                ],
              }
            : m,
        ),
        updatedAt: Date.now(),
      }));
    }
  };
}
