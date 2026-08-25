// Small pure helpers for the agentic MCP loop, pulled out of `mcpAgent.ts`.

/** Compact, safe JSON of tool args for the debug log (model-facing, redacted). */
export function safeJson(v: unknown, max = 400): string {
  try {
    return JSON.stringify(v ?? {}).slice(0, max);
  } catch {
    return String(v).slice(0, max);
  }
}

/** Deep-map every STRING value in a tool-args object through `fromWire`, returning
 *  a NEW object (the original — `call.arguments`, used for the real call — is never
 *  mutated). Used to show the user the REAL (un-redacted) values in the
 *  write-confirmation dialog: the model produced FAKES (what it saw), but the write
 *  will send the real data, so the confirmation must show what will ACTUALLY happen
 *  (the dialog is local — no leak). Keys are field names, left untouched. */
export function deredactArgs(v: unknown, fromWire: (s: string) => string): unknown {
  if (typeof v === "string") return fromWire(v);
  if (Array.isArray(v)) return v.map((x) => deredactArgs(x, fromWire));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = deredactArgs(val, fromWire);
    return out;
  }
  return v;
}

/** Compact the WIRE history for the next model turn: tool-result legs OLDER than the
 *  last `keepTurns` assistant tool-turns are truncated — a long workflow re-reads
 *  every past result verbatim on EVERY turn (mesuré : le 6e tour d'un scénario
 *  5-connecteurs relit ~8k tokens déjà exploités), which is both the token bill and
 *  the context-window pressure that breaks weak models on long orchestrations.
 *  Returns NEW objects (the caller's `messages` — journal, retries — stay intact);
 *  only `role:"tool"` content shrinks, never user/system/assistant. */
export function compactToolHistory<M extends { role: string; content: string }>(
  messages: M[],
  keepTurns = 2,
  maxChars = 400,
): M[] {
  // Index of the assistant turn marking the "recent" window start.
  let seen = 0;
  let cutoff = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      seen += 1;
      if (seen >= keepTurns) {
        cutoff = i;
        break;
      }
    }
  }
  return messages.map((m, i) =>
    m.role === "tool" && i < cutoff && m.content.length > maxChars
      ? { ...m, content: `${m.content.slice(0, maxChars)}\n…[résultat ancien tronqué — redemande l'outil si un détail manque]` }
      : m,
  );
}
