// Which past messages may go back to the model. A USER message goes back only once its
// redaction COMPLETED: `redactions` is written by the passes that vault its values
// (`sendOrchestrator/persistUserTurn.ts`, `refusedTurnRedaction.ts`, the import) and by
// nothing else. A turn refused because detection failed, or stopped before its redaction
// finished, keeps its real text on screen — and never leaves: not in the history, not in a
// context summary, not to memory extraction. Its values never reached the vault, so a
// replay would send them as typed. The model's own messages always go back (they are its
// output, replayed to the fakes it wrote).
export interface ReplayCandidate {
  role: string;
  redactions?: unknown;
}

export function wasRedacted(m: ReplayCandidate): boolean {
  return m.role !== "user" || typeof m.redactions === "number";
}

export function replayable<T extends ReplayCandidate>(messages: T[]): T[] {
  return messages.filter(wasRedacted);
}
