import { retryAfterHint, requestIdHint } from "../apiError.js";
import { googleUsage } from "../wire/index.js";
import type {
  ChatMessage,
  CompleteToolsOptions,
  CompleteToolsResult,
  ToolCall,
} from "../types.js";

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  // Opaque reasoning token Gemini 3+ attaches to a functionCall part; it MUST be
  // sent back verbatim when the call is replayed in history, or the API 400s.
  thoughtSignature?: string;
}
interface Content {
  role: "user" | "model";
  parts: Part[];
}

/**
 * Translate our agentic messages into Gemini `contents`. Gemini has no "system"/
 * "tool"/"assistant" roles: system goes to `systemInstruction`, assistant → "model",
 * and a tool result (`role: "tool"`) becomes a `functionResponse` part in a user
 * turn. Gemini function calls carry no id, so we resolve the function NAME for a
 * tool result from the preceding assistant `toolCalls` (matched by our synthetic id).
 */
function toGeminiContents(messages: ChatMessage[]): Content[] {
  const idToName = new Map<string, string>();
  for (const m of messages)
    for (const c of m.toolCalls ?? []) idToName.set(c.id, c.name);

  const out: Content[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      const name = idToName.get(m.toolCallId ?? "") ?? m.toolCallId ?? "tool";
      out.push({
        role: "user",
        parts: [{ functionResponse: { name, response: { result: m.content } } }],
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls)
        parts.push({
          functionCall: { name: c.name, args: c.arguments },
          // Gemini 3+ rejects a replayed functionCall that lost its signature.
          ...(c.thoughtSignature ? { thoughtSignature: c.thoughtSignature } : {}),
        });
      out.push({ role: "model", parts });
      continue;
    }
    // A user turn may carry image attachments (a redacted document sent as page
    // images). Expand them into inlineData parts exactly like the plain-stream path
    // (providers/google.ts) — without this the agentic/tools path silently dropped the
    // images, so a document sent to a model WITH an MCP connector never reached it.
    if (m.attachments?.length) {
      const parts: Part[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const a of m.attachments)
        parts.push({ inlineData: { mimeType: a.mediaType, data: a.dataBase64 } });
      out.push({ role: "user", parts });
      continue;
    }
    out.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }
  return out;
}

// Gemini accepts only an OpenAPI-3 SUBSET for tool parameters and 400s on standard
// JSON-Schema keywords MCP servers emit ($schema, additionalProperties, const,
// exclusiveMinimum, propertyNames, …). Keep only supported fields, recurse into
// structural ones, and translate the few convertible keywords.
const SCHEMA_KEEP = new Set([
  "type", "format", "description", "title", "nullable", "enum", "default", "example",
  "minimum", "maximum", "minLength", "maxLength", "pattern",
  "items", "minItems", "maxItems", "properties", "required",
  "anyOf", "allOf", "oneOf",
]);

/** Enum values Gemini accepts: non-empty strings (it 400s on empty enum values). */
function cleanEnum(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const vals = v
    .filter((x) => x != null && x !== "")
    .map((x) => String(x));
  return vals.length ? vals : undefined;
}

export function sanitizeGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "const") {
      // A constant → a single-value enum, but only if non-empty (Gemini rejects
      // empty enum values); an empty const just becomes an untyped string leaf.
      const e = cleanEnum([v]);
      if (e) out.enum = e;
      continue;
    }
    if (k === "exclusiveMinimum") { if (typeof v === "number") out.minimum = v; continue; }
    if (k === "exclusiveMaximum") { if (typeof v === "number") out.maximum = v; continue; }
    if (!SCHEMA_KEEP.has(k)) continue; // drop $schema, additionalProperties, propertyNames…
    if (k === "enum") {
      const e = cleanEnum(v);
      if (e) out.enum = e;
      continue;
    }
    if (k === "type" && Array.isArray(v)) {
      const nonNull = v.filter((t) => t !== "null");
      out.type = nonNull[0] ?? "string";
      if (v.includes("null")) out.nullable = true;
    } else if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, sanitizeGeminiSchema(pv)]),
      );
    } else if (k === "items" || k === "anyOf" || k === "allOf" || k === "oneOf") {
      out[k] = sanitizeGeminiSchema(v);
    } else {
      out[k] = v;
    }
  }
  // Never emit an empty/typeless leaf (e.g. a dropped empty const) — Gemini wants
  // a type. Default a bare leaf to string; enum implies string too.
  const structural = out.properties || out.items || out.anyOf || out.allOf || out.oneOf;
  if (!out.type && !structural) out.type = "string";
  return out;
}

const STOP: Record<string, CompleteToolsResult["stopReason"]> = {
  STOP: "stop",
  MAX_TOKENS: "length",
};

/** Non-streaming Google Gemini completion with function-calling. */
export async function completeGoogleTools(
  opts: CompleteToolsOptions,
): Promise<CompleteToolsResult> {
  const system = opts.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(opts.model)}:generateContent?key=${opts.apiKey ?? ""}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      contents: toGeminiContents(opts.messages),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      // `parameters` is sanitised to Gemini's OpenAPI subset (see sanitizeGeminiSchema).
      ...(opts.tools?.length
        ? {
            tools: [
              {
                functionDeclarations: opts.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parameters: sanitizeGeminiSchema(t.parameters),
                })),
              },
            ],
            // Default is AUTO; force a function call when the caller demands it.
            ...(opts.toolChoice === "required"
              ? { toolConfig: { functionCallingConfig: { mode: "ANY" } } }
              : {}),
          }
        : {}),
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google tools request failed (${res.status})${retryAfterHint(res, body)}${requestIdHint(res)}: ${body}`);
  }

  const json = await res.json();
  const cand = json.candidates?.[0];
  const parts: Part[] = cand?.content?.parts ?? [];
  let text = "";
  const toolCalls: ToolCall[] = [];
  let i = 0;
  for (const p of parts) {
    if (typeof p.text === "string") text += p.text;
    else if (p.functionCall)
      toolCalls.push({
        id: `call_${i++}_${p.functionCall.name}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args ?? {},
        // Preserve Gemini 3's per-call signature so the next turn can replay it.
        ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
      });
  }

  // Gemini can end a turn with NO text and NO function call — usually a weak model
  // that malformed the tool call, or a blocked/truncated response. Left empty, the
  // agent loop would show a blank bubble ("stops with no message"); surface WHY.
  const finish = cand?.finishReason as string | undefined;
  if (!text && toolCalls.length === 0) {
    if (finish === "MALFORMED_FUNCTION_CALL")
      text = "_(Gemini a mal formé l'appel d'outil et n'a rien renvoyé — réessayez ou choisissez un modèle plus capable.)_";
    else if (finish === "SAFETY" || finish === "RECITATION" || finish === "BLOCKLIST" || finish === "PROHIBITED_CONTENT")
      text = `_(Réponse bloquée par Gemini (${finish}).)_`;
    else if (finish === "MAX_TOKENS")
      text = "_(Réponse coupée par la limite de tokens.)_";
    else if (finish && finish !== "STOP")
      text = `_(Gemini a interrompu la réponse (${finish}).)_`;
  }

  return {
    text,
    toolCalls,
    stopReason: toolCalls.length
      ? "tool_calls"
      : STOP[cand?.finishReason as string] ?? "other",
    usage: googleUsage(json.usageMetadata),
  };
}
