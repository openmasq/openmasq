// The OpenAI wire: Chat Completions (`/v1/chat/completions`), Responses (`/v1/responses`)
// and Embeddings (`/v1/embeddings`). OUT: every piece of text the model would read is masked
// — system and user text, the assistant history, tool results, and the arguments of the
// tool calls already in the history (a REAL value the client executed on). BACK: the reply's
// text is restored for the reader, the tool-call arguments for the executor (`restoreArgs`).
import { isRecord, mapJsonString, mapJsonStringSync } from "../../lib/json.js";

export type MaskFn = (text: string) => Promise<string>;
export interface RestoreFns {
  reply: (text: string) => string;
  args: (text: string) => string;
}

const TEXT_PART_TYPES = new Set(["text", "input_text", "output_text"]);

/** Mask a `content` field: a string, or an array of parts whose text parts are masked. */
async function maskContent(content: unknown, mask: MaskFn): Promise<unknown> {
  if (typeof content === "string") return mask(content);
  if (!Array.isArray(content)) return content;
  const out: unknown[] = [];
  for (const part of content) {
    if (isRecord(part) && TEXT_PART_TYPES.has(String(part.type)) && typeof part.text === "string") {
      out.push({ ...part, text: await mask(part.text) });
    } else out.push(part);
  }
  return out;
}

function restoreContent(content: unknown, restore: (s: string) => string): unknown {
  if (typeof content === "string") return restore(content);
  if (!Array.isArray(content)) return content;
  return content.map((part) =>
    isRecord(part) && TEXT_PART_TYPES.has(String(part.type)) && typeof part.text === "string"
      ? { ...part, text: restore(part.text) }
      : part,
  );
}

/** Chat Completions request. */
export async function maskChatRequest(
  body: Record<string, unknown>,
  mask: MaskFn,
): Promise<Record<string, unknown>> {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const out: unknown[] = [];
  for (const m of messages) {
    if (!isRecord(m)) {
      out.push(m);
      continue;
    }
    const next: Record<string, unknown> = { ...m, content: await maskContent(m.content, mask) };
    if (Array.isArray(m.tool_calls)) {
      const calls: unknown[] = [];
      for (const c of m.tool_calls) {
        if (isRecord(c) && isRecord(c.function) && typeof c.function.arguments === "string") {
          calls.push({
            ...c,
            function: { ...c.function, arguments: await mapJsonString(c.function.arguments, mask) },
          });
        } else calls.push(c);
      }
      next.tool_calls = calls;
    }
    out.push(next);
  }
  return { ...body, messages: out };
}

/** Responses request: `instructions`, then `input` as a string or a list of items. */
export async function maskResponsesRequest(
  body: Record<string, unknown>,
  mask: MaskFn,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...body };
  if (typeof body.instructions === "string") out.instructions = await mask(body.instructions);
  if (typeof body.input === "string") out.input = await mask(body.input);
  else if (Array.isArray(body.input)) {
    const items: unknown[] = [];
    for (const it of body.input) {
      if (!isRecord(it)) {
        items.push(it);
        continue;
      }
      const next: Record<string, unknown> = { ...it };
      if (it.content !== undefined) next.content = await maskContent(it.content, mask);
      if (typeof it.arguments === "string")
        next.arguments = await mapJsonString(it.arguments, mask);
      if (typeof it.output === "string") next.output = await mask(it.output);
      items.push(next);
    }
    out.input = items;
  }
  return out;
}

/** Embeddings request: `input` string or list of strings. */
export async function maskEmbeddingsRequest(
  body: Record<string, unknown>,
  mask: MaskFn,
): Promise<Record<string, unknown>> {
  if (typeof body.input === "string") return { ...body, input: await mask(body.input) };
  if (Array.isArray(body.input) && body.input.every((s) => typeof s === "string")) {
    const input: string[] = [];
    for (const s of body.input as string[]) input.push(await mask(s));
    return { ...body, input };
  }
  return body;
}

/** Chat Completions response (non-streaming). */
export function restoreChatResponse(
  body: Record<string, unknown>,
  fns: RestoreFns,
): Record<string, unknown> {
  if (!Array.isArray(body.choices)) return body;
  const choices = body.choices.map((ch) => {
    if (!isRecord(ch) || !isRecord(ch.message)) return ch;
    const msg: Record<string, unknown> = {
      ...ch.message,
      content: restoreContent(ch.message.content, fns.reply),
    };
    if (Array.isArray(ch.message.tool_calls)) {
      msg.tool_calls = ch.message.tool_calls.map((c) =>
        isRecord(c) && isRecord(c.function) && typeof c.function.arguments === "string"
          ? {
              ...c,
              function: {
                ...c.function,
                arguments: mapJsonStringSync(c.function.arguments, fns.args),
              },
            }
          : c,
      );
    }
    return { ...ch, message: msg };
  });
  return { ...body, choices };
}

/** Responses response (non-streaming): message items' text, function calls' arguments. */
export function restoreResponsesResponse(
  body: Record<string, unknown>,
  fns: RestoreFns,
): Record<string, unknown> {
  if (!Array.isArray(body.output)) return body;
  const output = body.output.map((it) => {
    if (!isRecord(it)) return it;
    if (it.type === "function_call" && typeof it.arguments === "string") {
      return { ...it, arguments: mapJsonStringSync(it.arguments, fns.args) };
    }
    if (it.content !== undefined) return { ...it, content: restoreContent(it.content, fns.reply) };
    return it;
  });
  return { ...body, output };
}
