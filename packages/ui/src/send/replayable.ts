// Which past messages may go back to the model. A USER message goes back only once its
// redaction COMPLETED: `redactions` is written by the passes that vault its values
// (`sendOrchestrator/persistUserTurn.ts`, `refusedTurnRedaction.ts`,
// `sendOrchestrator/importedTurns.ts`) and by nothing else. An IMPORTED message, of either
// role, waits for that pass too: the other assistant's replies quote real values it saw. A turn refused because detection failed, or stopped before its redaction
// finished, keeps its real text on screen — and never leaves: not in the history, not in a
// context summary, not to memory extraction. Its values never reached the vault, so a
// replay would send them as typed. The model's own messages always go back (they are its
// output, replayed to the fakes it wrote).
import { isImportedMessageId } from "../import/ids";

export interface ReplayCandidate {
  id?: string;
  role: string;
  redactions?: unknown;
}

export function wasRedacted(m: ReplayCandidate): boolean {
  if (typeof m.redactions === "number") return true;
  return m.role !== "user" && !isImportedMessageId(m.id);
}

export function replayable<T extends ReplayCandidate>(messages: T[]): T[] {
  return messages.filter(wasRedacted);
}
