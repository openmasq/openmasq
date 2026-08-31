import { backendFetch } from "../backendFetch";
import {
  BACKEND_CONFIGURED,
  BACKEND_URL,
  CUSTOM_STACK,
  CUSTOM_STACK_ALLOWED,
  RUNTIME_ENV,
} from "../appEnv";
import { authHost } from "../auth";
import type { Host } from "@openmasq/ui";

/**
 * The runtime environment (production/staging) + its switch — the
 * "Environment" card in Settings → Versions, and the SELF-HOSTED stack entered there.
 *
 * Outside `main.tsx` because it's the only `Host` slot that carries a DECISION of its
 * own (three composed guards), and because the root composition must stay
 * readable in one screen: what's read there is the LIST of capabilities, not how one
 * of them is guarded.
 *
 * The three guards, in the order they fall:
 * 1. `switchTo` missing from preload (not restarted) ⇒ no card at all, never a throw.
 * 2. Only one backend baked in ⇒ nothing to switch to… UNLESS the build honors a
 *    self-hosted stack: that's precisely in a build without a backend that one is entered.
 * 3. `setCustomStack` missing from preload ⇒ the card shows without the entered stack.
 *
 * ⚠️ Everything here is DISPLAY. The decision lives in main
 * (`registerEnvIpc` / `registerCustomStackIpc`, fail-closed): a renderer decides
 * nothing, and `stagingTester` only proposes the switch or not.
 */
export function envSlot(): Host["env"] {
  return (BACKEND_CONFIGURED || CUSTOM_STACK_ALLOWED) && window.openmasq.env?.switchTo
    ? {
        name: RUNTIME_ENV,
        // The entered stack: proposed only if the build honors it AND the preload
        // knows how to write it (a preload from before the feature lacks the method).
        customStack:
          CUSTOM_STACK_ALLOWED && window.openmasq.env.setCustomStack
            ? {
                current: CUSTOM_STACK,
                set: (stack) => window.openmasq.env.setCustomStack(stack),
                forget: () => window.openmasq.env.forgetCustomStack(),
              }
            : undefined,
        switchTo: async (envName) => {
          const token = (await authHost.getAccessToken?.().catch(() => null)) ?? undefined;
          return window.openmasq.env.switchTo(envName, token);
        },
        // DISPLAY only (propose the switch or not), fail-closed to false — the real
        // guard lives in main at switch time, and BACKEND_URL is indeed production.
        stagingTester: async () => {
          try {
            const token = await authHost.getAccessToken?.();
            if (!token) return false;
            // `backendFetch`, never `fetch`: it carries the client identity — see its source.
            const res = await backendFetch(`${BACKEND_URL}/v1/flags`, {
              headers: { authorization: `Bearer ${token}` },
            });
            if (!res.ok) return false;
            const body = (await res.json()) as { flags?: { staging_tester?: boolean } };
            return body?.flags?.staging_tester === true;
          } catch {
            return false;
          }
        },
      }
    : undefined;
}
