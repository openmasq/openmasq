/**
 * Parse a tool call's `arguments` when they arrive as a JSON STRING — the
 * OpenAI-compatible wire, and the STREAMING Anthropic wire (`input_json_delta`
 * fragments concatenated). Shared so the two paths report a malformed call the same
 * way (root rule 9); the non-streaming Anthropic/Google paths hand back a native
 * object and never come through here.
 *
 * On malformed JSON we DON'T silently degrade to `{}` — that hides the mistake from
 * the model, which then retries the same broken call until the turn cap. Instead we
 * return the parse error so the loop can hand it back verbatim (`ToolCall.argsError`).
 */
export function parseArgs(raw: string): { args: Record<string, unknown>; error?: string } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { args: {} };
  try {
    const v = JSON.parse(trimmed);
    if (v && typeof v === "object" && !Array.isArray(v)) return { args: v };
    return {
      args: {},
      error: `les arguments doivent être un objet JSON, reçu ${Array.isArray(v) ? "un tableau" : typeof v}`,
    };
  } catch (e) {
    return { args: {}, error: e instanceof Error ? e.message : "JSON invalide" };
  }
}
