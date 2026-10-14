// The OpenAI wire: Chat Completions (`/v1/chat/completions`), Responses (`/v1/responses`)
// and Embeddings (`/v1/embeddings`). OUT: every piece of text the model would read is masked
// — system and user text, the assistant history, tool results, and the arguments of the
// tool calls already in the history (a REAL value the client executed on). BACK: the reply's
// text is restored for the reader, the tool-call arguments for the executor (`restoreArgs`).
import {
  isRecord,
  mapJsonString,
  mapJsonStringSync,
  mapStrings,
  mapStringsSync,
} from "../../lib/json.js";

export type MaskFn = (text: string) => Promise<string>;
export interface RestoreFns {
  reply: (text: string) => string;
  args: (text: string) => string;
}

const TEXT_PART_TYPES = new Set(["text", "input_text", "output_text"]);

/** Mistral's reasoning part — `{type:"thinking", thinking:[{type:"text",text}]}` (or a bare
 *  string). The client sends it back in the history, so the model READS it: it is masked
 *  like any text, and restored on the way back like any reply. */
const isThinking = (part: unknown): part is Record<string, unknown> =>
  isRecord(part) && part.type === "thinking";

/** Mask a `content` field: a string, or an array of parts whose text parts are masked. */
async function maskContent(content: unknown, mask: MaskFn): Promise<unknown> {
  if (typeof content === "string") return mask(content);
  if (!Array.isArray(content)) return content;
  const out: unknown[] = [];
  for (const part of content) {
    if (isRecord(part) && TEXT_PART_TYPES.has(String(part.type)) && typeof part.text === "string") {
      out.push({ ...part, text: await mask(part.text) });
    } else if (isThinking(part)) {
      out.push({ ...part, thinking: await maskContent(part.thinking, mask) });
    } else out.push(part);
  }
  return out;
}

function restoreContent(content: unknown, restore: (s: string) => string): unknown {
  if (typeof content === "string") return restore(content);
  if (!Array.isArray(content)) return content;
  return content.map((part) => {
    if (isRecord(part) && TEXT_PART_TYPES.has(String(part.type)) && typeof part.text === "string")
      return { ...part, text: restore(part.text) };
    if (isThinking(part)) return { ...part, thinking: restoreContent(part.thinking, restore) };
    return part;
  });
}

/** Tool-call `arguments`: a JSON STRING on OpenAI's wire, and either that or an OBJECT on
 *  Mistral's. Both are walked — an object left as is would go out with its real values. */
async function maskArgs(args: unknown, mask: MaskFn): Promise<unknown> {
  if (typeof args === "string") return mapJsonString(args, mask);
  return isRecord(args) ? mapStrings(args, mask) : args;
}
export function restoreArgs(args: unknown, restore: (s: string) => string): unknown {
  if (typeof args === "string") return mapJsonStringSync(args, restore);
  return isRecord(args) ? mapStringsSync(args, restore) : args;
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
        if (isRecord(c) && isRecord(c.function) && c.function.arguments !== undefined) {
          calls.push({
            ...c,
            function: {
              ...c.function,
              arguments: await maskArgs(c.function.arguments, mask),
            },
          });
        } else calls.push(c);
      }
      next.tool_calls = calls;
    }
    out.push(next);
  }
  const caller = await maskCaller(body, mask);
  const masked: Record<string, unknown> = { ...body, messages: out, ...caller };
  // A Predicted Output is the text the model is told to expect back: it is read like a prompt.
  if (isRecord(body.prediction) && body.prediction.content !== undefined)
    masked.prediction = {
      ...body.prediction,
      content: await maskContent(body.prediction.content, mask),
    };
  return masked;
}

/** `user` and `metadata` values travel to the provider beside the prompt (an end-user id is
 *  often an email; metadata holds whatever the caller tagged). Both are masked. */
async function maskCaller(
  body: Record<string, unknown>,
  mask: MaskFn,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (typeof body.user === "string") out.user = await mask(body.user);
  if (isRecord(body.metadata)) {
    const metadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.metadata))
      metadata[k] = typeof v === "string" ? await mask(v) : v;
    out.metadata = metadata;
  }
  return out;
}

/** Responses request: `instructions`, then `input` as a string or a list of items. */
export async function maskResponsesRequest(
  body: Record<string, unknown>,
  mask: MaskFn,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...body, ...(await maskCaller(body, mask)) };
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
      // A tool output is a string or a list of content parts (`input_text`, images, files).
      if (it.output !== undefined) next.output = await maskContent(it.output, mask);
      // A custom tool's call carries its free-form `input` where a function call has JSON.
      if (it.type === "custom_tool_call" && typeof it.input === "string")
        next.input = await mask(it.input);
      items.push(next);
    }
    out.input = items;
  }
  return out;
}

/** Embeddings request: `input` string or list of strings. A list of TOKEN ids (numbers)
 *  is not text this proxy can read — it passes as is (README « Security »). */
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
        isRecord(c) && isRecord(c.function) && c.function.arguments !== undefined
          ? {
              ...c,
              function: {
                ...c.function,
                arguments: restoreArgs(c.function.arguments, fns.args),
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
