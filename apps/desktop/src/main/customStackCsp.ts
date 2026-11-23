/**
 * The renderer's CSP, WIDENED to the self-hosted stack's origins — at load time, by
 * main, and only in the `custom` environment.
 *
 * `index.html`'s CSP is a STATIC `<meta>` tag (`src/renderer/index.html`): it
 * only allows `'self'`, the baked Supabase and `https://*.<brand domain>`. A
 * meta-CSP cannot be LOOSENED by a header (both apply, the stricter one wins),
 * so a stack on another domain would be blocked even if accepted by main. The only
 * honest way to widen it is to serve an `index.html` whose `connect-src` carries the
 * declared origins IN ADDITION — exactly those, never a wildcard (`customCspOrigins`).
 *
 * Mechanism: this module only builds the rewrite; `rendererFileScope.ts` (the ONE `file:`
 * handler of the default session) applies it to the renderer's `index.html` and to nothing else.
 */
import { customCspOrigins, patchCspConnectSrc } from "../environments/customStack";
import type { EnvName } from "../environments";
import { readEnvPointerFull } from "./environment";

/** The `index.html` rewrite for this profile, or null: nothing to do outside the `custom`
 *  environment, and nothing either if the pointer no longer carries a valid stack
 *  (`environment.ts` re-reads and REVALIDATES — a stack tampered with on disk widens nothing). */
export function customStackIndexPatch(profile: { env: EnvName; baseUserData: string }): ((html: string) => string) | null {
  if (profile.env !== "custom") return null;
  const { custom } = readEnvPointerFull(profile.baseUserData);
  if (!custom) return null;
  const origins = customCspOrigins(custom);
  if (origins.length === 0) return null;
  return (html) => patchCspConnectSrc(html, origins);
}
