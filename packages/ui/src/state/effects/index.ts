/* The store's EFFECTS, peeled out of `store.ts` (rule 1). Each hook owns one subject
   and takes what it needs explicitly, so the store composes them instead of holding
   them: `useLocalPersistence` = the plaintext localStorage mirror + its account
   scoping, `usePlatformEffects` = what the renderer pushes outward (consent, link
   previews, theme) plus the two warm-ups and the connected-integration keep-list. */
export { useLocalPersistence } from "./useLocalPersistence";
export { usePlatformEffects } from "./usePlatformEffects";
// `useOrgProfile` = l'autorisation d'org du membre : chargée, retentée en backoff,
// rechargée au sign-in/out ET au focus fenêtre (rejoindre une org passe par le web).
export { useOrgProfile } from "./useOrgProfile";
// Monté par la COQUILLE (`containers/shell/useShell`) : ouvrir le fil cliqué demande la
// nav de section, que le store n'a pas.
export { useReplyNotice } from "./useReplyNotice";
