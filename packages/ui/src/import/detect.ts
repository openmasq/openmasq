import type { ImportProvider } from "./types";

/** Best-effort shape sniff of an export payload — used ONLY to phrase a helpful
 *  error when the user picked the wrong provider tile (ChatGPT exports carry a
 *  `mapping` tree; claude.ai exports carry `chat_messages`). */
export function detectExportProvider(json: unknown): ImportProvider | null {
  if (!Array.isArray(json)) return null;
  for (const item of json as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    if ("mapping" in item) return "chatgpt";
    if ("chat_messages" in item) return "claude";
  }
  return null;
}
