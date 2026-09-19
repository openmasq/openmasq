import type { AskTarget } from "../../types";
import type { Attachment } from "./Composer";

export type ForcedItem = { value: string; category: string };
export type SubmitSkill = { id: string; name: string; prompt?: string; servers?: string[] };
export type DocReplacements = Record<string, { real: string; fake: string; tone?: string }[]>;

export interface SubmitPlan {
  /** The files that ride the send — only the ones with extracted text. */
  files: Attachment[];
  opts: {
    competence?: SubmitSkill;
    askTarget?: AskTarget;
    docReplacements?: DocReplacements;
    plotTag?: "graphique" | "preciser";
    forcedRedactions?: ForcedItem[];
  };
}

/**
 * What a composer submit SENDS — pure, so the two shapes of a send (with and without
 * documents) are ONE decision instead of two hand-copied option bags (rule 9).
 *
 * The invariant this pins (`submitPlan.test.ts`): a manual « Masquer » made BEFORE the
 * conversation exists rides the send WHATEVER its shape. The buffer `pendingForced` only
 * holds the pre-conversation case (once a conversation exists `store.forceRedact` already
 * persisted the value on it), and the store persists what it receives here onto the
 * conversation it creates — so a value masked by hand on a document dropped into a NEW
 * chat is forced on that first send AND on every message after it. A send shape that
 * forgets the buffer ships the value in clear and never records it: that is the leak this
 * module exists to make impossible.
 *
 * `docReplacements` (the drop-time redaction to reuse) and `plotTag` keep their shape:
 * only a send carrying documents reuses a document pass; only a bare text send carries
 * the composer's staged tag.
 */
export function planSubmit(p: {
  attachments: Attachment[];
  hasConversation: boolean;
  pendingForced: ForcedItem[];
  skill?: SubmitSkill;
  askTarget?: AskTarget;
  plotTag?: "graphique" | "preciser";
  reuseDocReplacements: (files: Attachment[]) => DocReplacements;
}): SubmitPlan {
  const files = p.attachments.filter((a) => a.text.trim());
  const forcedRedactions = p.hasConversation || !p.pendingForced.length ? undefined : p.pendingForced;
  const common = { competence: p.skill, askTarget: p.askTarget, forcedRedactions };
  return files.length > 0
    ? { files, opts: { ...common, docReplacements: p.reuseDocReplacements(files) } }
    : { files, opts: { ...common, plotTag: p.plotTag } };
}
