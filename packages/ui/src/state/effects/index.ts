/* The store's EFFECTS, peeled out of `store.ts` (rule 1). Each hook owns one subject
   and takes what it needs explicitly, so the store composes them instead of holding
   them: `useLocalPersistence` = the plaintext localStorage mirror + its account
   scoping, `usePlatformEffects` = what the renderer pushes outward (consent, link
   previews, theme) plus the two warm-ups and the connected-integration keep-list. */
export { useLocalPersistence } from "./useLocalPersistence";
export { usePlatformEffects } from "./usePlatformEffects";
// `useOrgProfile` = the member's org authorization: loaded, retried with backoff,
// reloaded on sign-in/out AND on window focus (joining an org goes through the web).
export { useOrgProfile } from "./useOrgProfile";
// Mounted by the SHELL (`containers/shell/useShell`): opening the clicked thread needs
// the section nav, which the store doesn't have.
export { useReplyNotice } from "./useReplyNotice";
