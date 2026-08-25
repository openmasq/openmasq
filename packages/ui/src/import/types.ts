/** The providers whose official data export we can parse (BETA). Gemini is absent on
 *  purpose: Google Takeout does not preserve thread structure, so a faithful import
 *  isn't possible yet — the UI shows it greyed as « bientôt ». */
export type ImportProvider = "chatgpt" | "claude";

/** Outcome of merging parsed conversations into the store (dedup by stable id). */
export interface ImportOutcome {
  added: number;
  skipped: number;
}

/** Parse-time progress for the modal: which conversation of how many is being
 *  redacted (the per-conversation redaction pass dominates the wall clock). */
export type ImportProgress = (done: number, total: number) => void;
