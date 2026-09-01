/**
 * Unicode word boundaries for the intent lexicons — NEVER `\b`: `\b` is
 * ASCII, so « Écris » at the start of a sentence opens no boundary (the trap pinned
 * in `agent/sendIntent.ts`, relived in `agent/readIntent.ts`). ONE definition
 * (rule 9) shared by the three lexicons: `agent/readIntent.ts`,
 * `agent/sendIntent.ts`, `send/autoTaskIntent.ts`.
 */
export const EDGE_L = "(?<![\\p{L}])";
export const EDGE_R = "(?![\\p{L}])";
