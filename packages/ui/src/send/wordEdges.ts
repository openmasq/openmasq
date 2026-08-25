/**
 * Frontières de mot Unicode pour les lexiques d'intention — JAMAIS `\b` : `\b` est
 * ASCII, donc « Écris » en tête de phrase n'ouvre aucune frontière (le piège épinglé
 * dans `agent/sendIntent.ts`, revécu dans `agent/readIntent.ts`). UNE définition
 * (règle 9) partagée par les trois lexiques : `agent/readIntent.ts`,
 * `agent/sendIntent.ts`, `send/autoTaskIntent.ts`.
 */
export const EDGE_L = "(?<![\\p{L}])";
export const EDGE_R = "(?![\\p{L}])";
