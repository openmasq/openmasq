// A path segment read like a SENTENCE (`../paths.ts` builds the fake path from these;
// `../pseudonymize/pathEntities.ts` finds what the segments hold).
export { spacedForDetection } from "./words";
export { usernameIndex, fakeUsername } from "./username";
export { probableEntities, type Finding } from "./heuristic";
export { fakeSegmentText, occurrences } from "./segment";
