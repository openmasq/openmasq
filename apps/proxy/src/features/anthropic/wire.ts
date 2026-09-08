// The Anthropic Messages wire (`/v1/messages`). OUT: `system` (string or text blocks) and
// every message block the model reads — text, tool results, and the `input` of the tool uses
// already in the history. BACK: text blocks restored for the reader, tool-use inputs for the
// executor (`restoreArgs`, every string leaf).
import { isRecord, mapStrings, mapStringsSync } from "../../lib/json.js";
import type { MaskFn, RestoreFns } from "../openai/wire.js";

async function maskBlocks(content: unknown, mask: MaskFn): Promise<unknown> {
  if (typeof content === "string") return mask(content);
  if (!Array.isArray(content)) return content;
  const out: unknown[] = [];
  for (const b of content) {
    if (!isRecord(b)) {
      out.push(b);
      continue;
    }
    switch (b.type) {
      case "text":
        out.push(typeof b.text === "string" ? { ...b, text: await mask(b.text) } : b);
        break;
      case "tool_result":
        out.push({ ...b, content: await maskBlocks(b.content, mask) });
        break;
      case "tool_use":
        out.push({ ...b, input: await mapStrings(b.input, mask) });
        break;
      default:
        out.push(b);
    }
  }
  return out;
}

export async function maskMessagesRequest(
  body: Record<string, unknown>,
  mask: MaskFn,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...body };
  if (body.system !== undefined) out.system = await maskBlocks(body.system, mask);
  if (Array.isArray(body.messages)) {
    const messages: unknown[] = [];
    for (const m of body.messages) {
      messages.push(isRecord(m) ? { ...m, content: await maskBlocks(m.content, mask) } : m);
    }
    out.messages = messages;
  }
  return out;
}

/** Messages response (non-streaming): `content[]` text and tool_use blocks. */
export function restoreMessagesResponse(
  body: Record<string, unknown>,
  fns: RestoreFns,
): Record<string, unknown> {
  if (!Array.isArray(body.content)) return body;
  const content = body.content.map((b) => {
    if (!isRecord(b)) return b;
    if (b.type === "text" && typeof b.text === "string") return { ...b, text: fns.reply(b.text) };
    if (b.type === "tool_use") return { ...b, input: mapStringsSync(b.input, fns.args) };
    return b;
  });
  return { ...body, content };
}
