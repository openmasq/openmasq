/**
 * La clé localStorage sous laquelle supabase-js range sa session : `sb-<ref>-auth-token`,
 * la ref étant celle du PROJET du build (`OPENMASQ_SUPABASE_URL`) — plus aucune ref
 * committée. Sans projet configuré, `sb-local-auth-token` : la graine est inerte (l'app
 * tourne alors sans comptes), ce qui est exactement l'état d'un clone non configuré.
 * Calculée côté Node et PASSÉE en argument aux closures `page.evaluate` — une constante
 * Node ne se référence pas depuis le navigateur.
 */
export function supabaseAuthStorageKey(): string {
  const ref =
    /https:\/\/([a-z0-9]+)\./.exec(process.env.OPENMASQ_SUPABASE_URL ?? "")?.[1] ?? "local";
  return `sb-${ref}-auth-token`;
}
