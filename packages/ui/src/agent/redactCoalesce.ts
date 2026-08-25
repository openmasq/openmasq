import type { Vault } from "@openmasq/mcp";

/**
 * Coalescing serialiser for tool-RESULT redaction — the successor of the `redactChain`
 * promise chain in `mcpAgent.ts`.
 *
 * The invariant is unchanged: concurrent redactions mutate the SHARED vault, so engine
 * passes run ONE at a time — a value seen in two results this turn gets ONE fake (atomic
 * identity). What changes is the cost model: the chain paid one FULL engine pass (remote
 * round-trip / local NER inference — seconds each on a WASM-fallback Intel Mac) per result,
 * serially. Here, every request that arrives while a pass is busy QUEUES; when the pass
 * frees, all queued requests of the SAME tool leave in ONE batched pass (`redactMany`,
 * backed by `batchRedact`). A parallel wave of N same-tool reads costs ~2 passes instead
 * of N.
 *
 * Grouping is by exact TOOL NAME (and same vault object), never by anything looser: the
 * per-connector clear policy (`SEARCH_CLEAR`/`BROWSER_CLEAR`/none) and the shape-keep
 * harvests are keyed off the tool, and batching across two policies would mix them —
 * exactly the caveat `batchRedact` states. Fail-safe: a batch that throws falls back to
 * per-entry single passes, and an entry's own failure rejects only that caller.
 */
export interface CoalescingRedactorDeps {
  one: (text: string, vault: Vault, tool?: string) => string | Promise<string>;
  /** Absent ⇒ pure serialisation, byte-for-byte the old chain's behaviour. */
  many?: (texts: string[], vault: Vault, tool?: string) => Promise<string[]>;
}

interface Pending {
  text: string;
  vault: Vault;
  tool: string;
  resolve: (out: string) => void;
  reject: (err: unknown) => void;
}

export function makeCoalescingRedactor(
  deps: CoalescingRedactorDeps,
): (text: string, vault: Vault, tool?: string) => Promise<string> {
  const queue: Pending[] = [];
  let draining = false;

  const runOne = async (e: Pending): Promise<void> => {
    try {
      e.resolve(await deps.one(e.text, e.vault, e.tool));
    } catch (err) {
      e.reject(err);
    }
  };

  const drain = async (): Promise<void> => {
    if (draining) return;
    draining = true;
    try {
      while (queue.length) {
        // Everything queued for the head's (tool, vault) leaves in this pass; other
        // tools stay queued and get their own pass right after.
        const head = queue[0];
        const group: Pending[] = [];
        for (let i = 0; i < queue.length; ) {
          if (queue[i].tool === head.tool && queue[i].vault === head.vault) {
            group.push(queue.splice(i, 1)[0]);
          } else i++;
        }
        if (group.length > 1 && deps.many) {
          try {
            const out = await deps.many(group.map((g) => g.text), head.vault, head.tool);
            // Defensive: a count mismatch would mis-attribute results to callers —
            // fall back to per-entry passes instead (batchRedact never produces one).
            if (out.length !== group.length) throw new Error("batch count mismatch");
            group.forEach((g, i) => g.resolve(out[i]));
          } catch {
            for (const g of group) await runOne(g);
          }
        } else {
          for (const g of group) await runOne(g);
        }
      }
    } finally {
      draining = false;
    }
  };

  return (text: string, vault: Vault, tool?: string): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      queue.push({ text, vault, tool: tool ?? "", resolve, reject });
      // Defer one microtask so same-tick concurrent callers land in ONE group.
      void Promise.resolve().then(drain);
    });
}
