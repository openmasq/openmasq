import type { ToolErrorReason } from "../../analytics";
import type { NavExfilFlag } from "../../state/browserPolicy";
import type { ToolsResult } from "./callModel";
import type { ResolvedAttachment, WriteConfirmReason } from "./types";

/** What a step of the per-call pipeline tells the turn: go on with the next call, or the
 *  loop has ended (every early exit of the loop returns `true` to the caller). */
export type Step = "next" | "stop";

export type ToolCall = ToolsResult["toolCalls"][number];

/** A connector call, once its name is canonical. */
export interface ConnectorCall {
  call: ToolCall;
  args: Record<string, unknown>;
  turn: number;
  server: string;
  /** The name's prefix before `__` (the connector), and the bare tool after it. */
  connectorId: string;
  bareTool: string;
}

/** Everything the gates decided about ONE call before any dispatch. */
export interface CallDecision {
  missing: string[];
  /** Args un-redacted through `fromWireArgs` (display + domain allow-list + arg scan). */
  deredactedArgs: Record<string, unknown>;
  navUrl: string;
  isNav: boolean;
  navBlocked: boolean;
  navHost: string;
  /** The URL the navigation ACTUALLY dispatches (`wireArg`-restored). */
  wireNavUrl: string;
  navFake: { host: string; fake: string } | null;
  isWrite: boolean;
  idemKey: string | null;
  alreadyDone: boolean;
  draftOnly: boolean;
  consultOnly: boolean;
  resolvedAttachments: ResolvedAttachment[];
  /** Requested names that matched NO stored file — WIRE form, they go back to the model. */
  unresolvedAttachmentNames: string[];
  attachmentNames: string[];
  needsConfirm: boolean;
  confirmFlags: NavExfilFlag[];
  confirmReason: WriteConfirmReason;
  /** Clear-mode for THIS call (a governed web tool touching no redacted data). */
  navClear: boolean;
  declinedByUser: boolean;
}

/** What the dispatch (or its absence) produced, consumed by the common tail. */
export interface CallOutcome {
  content: string;
  reason?: ToolErrorReason;
  /** The true verdict when the retry mechanics coerced `unknown` into `transport`. */
  trueUnknown: boolean;
  /** RAW error text, only ever pattern-matched locally — never shown to the model. */
  toolErrRaw: string;
  resultSummary?: string;
  progressNote?: string;
  progressP: Promise<void> | null;
  callMs?: number;
}
