import type { McpAgentParams } from "../../agent/mcpAgent";
import { base64ToBytes, bytesToBase64 } from "../../state/files/bytes";
import { uid } from "../../state/storePersistence";
import { uniqueFileName } from "../generatedFiles";
import { loadPythonSeeds } from "../pythonSeeds";
import type { RedactionSetup } from "./redactionSetup";
import type { TurnContext } from "./turnSetup";

/** A truncated working script misleads more than it helps: over the cap it is not kept. */
const PY_SCRIPT_WIRE_CAP = 6000;

type Seed = { name: string; base64: string };

/**
 * The code interpreter callbacks. ⚠️ ACCEPTED RESIDUAL (rule 7): the loop DE-REDACTS the
 * code before running it, so the executed code holds the user's real data and only the
 * model-facing stdout is re-redacted. The sandbox's egress + FS confinement
 * (`apps/desktop/src/main/python/`) is the ONLY thing between that data and the network.
 */
export function makePythonCallbacks(ctx: TurnContext, r: RedactionSetup) {
  const { d, conv, convId, assistantMsg, updateAssistant } = ctx;
  const { host } = d;
  const fileConvId = conv.sessionConversationId || convId;
  // Deliverables produced EARLIER IN THIS TURN: `conv` is a snapshot, so a second run the
  // same turn can only find them here (freshest version of a name wins in the seeds).
  const turnPyFiles: Seed[] = [];

  const pinAttachment = (att: { name: string; kind: "image" | "file"; mime: string }) =>
    d.patchConversation(convId, (c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.id === assistantMsg.id ? { ...m, attachments: [...(m.attachments ?? []), att] } : m,
      ),
      updatedAt: Date.now(),
    }));

  // The conversation's LAST working script seeds the sandbox as `analyse.py`, derived from
  // `Message.pythonScript` (wire, fakes) through `fromWire`, so iteration can load it.
  const runPython: McpAgentParams["runPython"] = host.python
    ? async (code) => {
        const priorScript = [...conv.messages].reverse().find((m) => m.role === "assistant" && m.pythonScript)
          ?.pythonScript;
        const scriptSeed: Seed[] = priorScript
          ? [{ name: "analyse.py", base64: bytesToBase64(new TextEncoder().encode(r.fromWire(priorScript))) }]
          : [];
        const seeds = await loadPythonSeeds({
          listFiles: host.db?.listFiles?.bind(host.db),
          loadFile: host.db?.loadFile?.bind(host.db),
          toBase64: bytesToBase64,
          conversationId: fileConvId,
          messages: conv.messages,
          // This turn's entries come LAST, so they win over the prior-turn script.
          turnFiles: [...scriptSeed, ...turnPyFiles],
        });
        return host.python!.run(code, (status) => updateAssistant({ toolStatus: status }), seeds);
      }
    : undefined;

  // A figure (PNG) is stored locally and pinned inline. A failed save THROWS through to the
  // loop, which counts the delivery as failed and tells the model.
  const onPythonImage: McpAgentParams["onPythonImage"] = async (img) => {
    if (!host.db?.saveFile) return;
    const stored = (await host.db.listFiles?.(fileConvId).catch(() => [])) ?? [];
    const name = uniqueFileName(img.name, new Set(stored.map((m) => m.name)));
    await host.db.saveFile({
      id: uid(),
      conversationId: fileConvId,
      name,
      mime: "image/png",
      redacted: false,
      original: base64ToBytes(img.base64),
      scrubbed: null,
    });
    pinAttachment({ name, kind: "image", mime: "image/png" });
  };

  // A run that SUCCEEDED keeps its script as the conversation's working script (wire form,
  // fakes): replayed in the wire history and seeded as `analyse.py`. No UI.
  const onPythonScript: McpAgentParams["onPythonScript"] = (wireCode) => {
    if (!wireCode.trim() || wireCode.length > PY_SCRIPT_WIRE_CAP) return;
    const seed: Seed = { name: "analyse.py", base64: bytesToBase64(new TextEncoder().encode(r.fromWire(wireCode))) };
    const si = turnPyFiles.findIndex((f) => f.name === seed.name);
    if (si >= 0) turnPyFiles[si] = seed;
    else turnPyFiles.push(seed);
    d.patchConversation(convId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === assistantMsg.id ? { ...m, pythonScript: wireCode } : m)),
      updatedAt: Date.now(),
    }));
  };

  // A deliverable (PDF/xlsx/docx…) holds the user's REAL data (the code ran de-redacted):
  // stored as-is, pinned as a chip or inline when it is an image. Same throw contract.
  const onPythonFile: McpAgentParams["onPythonFile"] = async (file) => {
    turnPyFiles.push({ name: file.name, base64: file.base64 });
    if (!host.db?.saveFile) return;
    const kind = file.mime.startsWith("image/") ? "image" : "file";
    await host.db.saveFile({
      id: uid(),
      conversationId: fileConvId,
      name: file.name,
      mime: file.mime,
      redacted: false,
      original: base64ToBytes(file.base64),
      scrubbed: null,
    });
    pinAttachment({ name: file.name, kind, mime: file.mime });
  };

  return { runPython, onPythonImage, onPythonScript, onPythonFile };
}
