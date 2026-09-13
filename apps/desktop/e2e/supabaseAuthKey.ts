import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyPublicServiceDefaults } from "../scripts/publicServices";

/**
 * The localStorage key supabase-js stores its session under: `sb-<ref>-auth-token`, the
 * ref being that of the project THE BUILD UNDER TEST was compiled against.
 *
 * ⚠️ It is the BUILD's project, never the test process's environment. `electron.vite.config.ts`
 * calls `applyPublicServiceDefaults` before it reads `process.env`, so every build — CI
 * included, with no secret whatsoever — ships the PUBLIC Supabase project. Reading a bare
 * `process.env.OPENMASQ_SUPABASE_URL` therefore gave `sb-local-auth-token` on any machine
 * that had not exported the variable by hand: the seed landed in a key supabase-js never
 * reads, the session stayed empty, and the app sat on the sign-in screen. The smoke then
 * waited 20 s for a button only a signed-in shell has. Seen on the Windows preflight of
 * 13/09/2026 and reproduced identically on macOS — it was never a platform bug.
 *
 * Calling the very function the build calls is what keeps the two in step: a variable the
 * CI sets, even empty, wins over the default on both sides.
 *
 * Computed on the Node side and PASSED as an argument to `page.evaluate` closures — a Node
 * constant cannot be referenced from inside the browser.
 */
export function supabaseAuthStorageKey(): string {
  const { domain } = JSON.parse(
    readFileSync(resolve(__dirname, "../../../packages/branding/branding.json"), "utf8"),
  ) as { domain: string };
  const env: NodeJS.ProcessEnv = { ...process.env };
  applyPublicServiceDefaults(env, { brandDomain: domain });
  const ref = /https:\/\/([a-z0-9]+)\./.exec(env.OPENMASQ_SUPABASE_URL ?? "")?.[1] ?? "local";
  return `sb-${ref}-auth-token`;
}
