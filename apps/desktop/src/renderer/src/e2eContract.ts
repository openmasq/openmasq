/**
 * The E2E bridge's CONTRACT — the one file both sides import: the renderer that installs
 * `window.__openmasqE2E` (`e2eBridge.tsx`) and the Playwright lab that drives it
 * (`e2e/workflows/real/lab.ts`). The two do not share a tsconfig, so this file stays
 * TYPES ONLY, without a single import: type-only imports are erased on both sides, and
 * a drift between the bridge and the spec is now a compile error instead of a comment.
 */
export interface E2eTurn {
  convId: string;
  done: boolean;
  /** Reply text as SHOWN (un-redacted) — what the user would read. */
  text: string;
  error: boolean;
  /** The persisted failure message ("SEND FAILED …") — THE diagnostic. */
  errorText: string;
  /** Tool calls seen on the turn's messages, in order (`connector__tool`). */
  tools: string[];
  /** THE conversation's REDACTION LOG: fake → real (`redactionVault`).
   *  Without it, a "the model replays the same tool" loop can HIDE a
   *  "NER redacted a TOOL NAME" loop (`execute-sql → jade-tom`) that breaks
   *  discovery: the bench must be able to tell the two apart. */
  redactions: Record<string, string>;
  ms: number;
}

/** What `window.__openmasqE2E` exposes — installed by the bridge, polled by the spec. */
export type E2eApi = {
  /** Fire a turn WITHOUT awaiting it — returns the conversation id at once. */
  send: (
    text: string,
    opts?: { approveWrites?: boolean; revealForWeb?: boolean; modelId?: string },
  ) => string;
  /** Is a model id RESOLVABLE? A dynamic OpenRouter slug
   *  (`poolside/laguna-xs-2.1`) only enters the registry after the
   *  catalogue fetch on mount; sending before that means starting on the FACTORY
   *  default model (measured: "… tools request failed (401)"). The spec waits for this. */
  modelReady: (id: string) => boolean;
  /** Snapshot of a turn (poll this from the spec). */
  turn: (convId: string) => E2eTurn | null;
  /** Every write the loop asked to confirm, in order — the anti-double-send probe. */
  confirms: () => {
    tool: string;
    convId: string;
    approved: boolean;
    at: number;
    /** The REAL args (un-redacted) submitted for confirmation — what the
     *  connector will receive. Lets the spec verify a recipient. */
    args: Record<string, unknown>;
  }[];
  /** THE DEBUG LOG of a conversation: the wire/turn/tool/phase entries
   *  with their redacted↔original mappings — what the app's Debug Log
   *  displays. This is what enables ITERATION: seeing that a tool name was redacted,
   *  which turn looped, which wire went out. Bounded by the app's buffer (200).
   *  `DebugEntry[]` on the renderer side; opaque here so this file imports nothing. */
  journal: (convId: string) => unknown[];
  /** Targeted diagnostic: mappings where the ORIGINAL looks like a TOOL
   *  NAME or a technical term (kebab-case, single-word PascalCase) redacted by
   *  mistake — the root cause of the posthog loops (`execute-sql → jade-tom`). */
  toolNameRedactions: (convId: string) => { fake: string; real: string }[];
};
