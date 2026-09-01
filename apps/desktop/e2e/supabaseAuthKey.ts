/**
 * The localStorage key under which supabase-js stores its session: `sb-<ref>-auth-token`,
 * the ref being that of the build's PROJECT (`OPENMASQ_SUPABASE_URL`) — no more ref
 * committed. Without a configured project, `sb-local-auth-token`: the seed is inert (the app
 * then runs with no accounts), which is exactly the state of an unconfigured clone.
 * Computed on the Node side and PASSED as an argument to `page.evaluate` closures — a Node
 * constant can't be referenced from the browser.
 */
export function supabaseAuthStorageKey(): string {
  const ref =
    /https:\/\/([a-z0-9]+)\./.exec(process.env.OPENMASQ_SUPABASE_URL ?? "")?.[1] ?? "local";
  return `sb-${ref}-auth-token`;
}
