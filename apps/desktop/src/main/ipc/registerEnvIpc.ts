import { app, ipcMain, type BrowserWindow } from "electron";
import { DEFAULT_ENV, ENVIRONMENTS, type EnvName } from "../../environments";
import { CUSTOM_STACK_ALLOWED } from "../../environments/customStack";
import { CLIENT_HEADER, clientIdentityHeader } from "../../clientIdentity";
import { classifyEnvChange, resolvedEnvPayload } from "./envSwitch";
import { readEnvPointerFull, writeEnvPointer } from "../environment";
import { registerCustomStackIpc } from "./registerCustomStackIpc";
import { selfPinAllowed } from "../updates/channel";
import { relaunchSafely } from "../updates/install";
import { handle, obj } from "./handle";

/**
 * The "environment" family: WHICH environment this install talks to, and how it
 * changes it. A single module, because it's a single boundary (rule 10).
 *
 * ⚠️ **Changing environment is not a preference**: it decides which API
 * the app talks to, hence which data it reads and writes. So the gate is in MAIN, never
 * in the UI — a renderer XSS would call the IPC directly (rule 7). It has
 * three teeth, and the order matters:
 *
 * 1. **Allow-list of NAMES.** The target must be `"staging"` or `"production"`. What is
 *    persisted then read back is never an address: `environments/` says why.
 * 2. **Returning to the current environment is always allowed** — that switches nothing.
 * 3. **Otherwise, a SERVER-verified permission**, fail-closed, via one of TWO paths:
 *    the ACCOUNT flag `staging_tester` (PRODUCTION backend, the account's Supabase
 *    token — granted to a person, valid on all their machines, revoked with one
 *    gesture), or `allow_self_pin` (updates Worker, per machine — support
 *    troubleshooting, the same gate as a channel change). The token comes from the renderer,
 *    and that's correct: it's not an ASSERTION we trust, it's a credential the
 *    backend verifies — a stolen token is the same problem as everywhere else.
 *
 * ⚠️ **The update channel is NOT touched**, and that's deliberate. With a single
 * artifact, the shipped bytes are the same everywhere: "which builds I receive" (the channel) and
 * "which API I talk to" (the environment) become two independent axes, granted
 * separately. Moving them together here would recreate the coupling we're undoing.
 *
 * The SELF-HOSTED stack (`custom`) has its own WRITE gate — `registerCustomStackIpc`
 * (validated in main + native box) — and exists only in a build that honors it. Here we
 * only RETURN to it (`env:switch` toward `custom`), which assumes a stack already written.
 */

/** Wire up the family. `current` is the environment resolved at startup, `baseUserData`
 *  the BASE folder where the pointer lives (never the current profile — see `environment.ts`). */
/** The ACCOUNT's `staging_tester` flag, requested from the PRODUCTION backend — always
 *  that one: the truth of roles lives in its DB, whatever the current environment
 *  (and it's never behind Vercel protection). Fail-closed on everything: token
 *  absent, network, non-2xx, malformed response — a refusal, never an exception. */
async function accountIsStagingTester(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !token) return false;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    t.unref?.();
    const res = await fetch(`${ENVIRONMENTS[DEFAULT_ENV].backend}/v1/flags`, {
      // The client identity travels on this path TOO: it's authenticated, so it
      // provisions the `users` row like any other — see `clientIdentity.ts`.
      headers: { Authorization: `Bearer ${token}`, [CLIENT_HEADER]: clientIdentityHeader(app.getVersion()) },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return false;
    const body = (await res.json()) as { flags?: { staging_tester?: boolean } };
    return body?.flags?.staging_tester === true;
  } catch {
    return false;
  }
}

export function registerEnvIpc(
  args: { env: EnvName; baseUserData: string },
  window: () => BrowserWindow | null = () => null,
): void {
  const current = args.env;
  // The entered stack, read back (and RE-VALIDATED) from the pointer: this is what the renderer
  // receives as `custom`, and what we keep when switching to a baked environment.
  const { custom } = readEnvPointerFull(args.baseUserData);
  const payload = resolvedEnvPayload(current, custom);
  registerCustomStackIpc({ baseUserData: args.baseUserData, window });

  // SYNCHRONOUS, and it's deliberate: `renderer/src/appEnv.ts` must know the addresses at
  // module load, before `auth.ts` builds the Supabase client. An asynchronous round
  // trip would arrive too late. A single exchange, at the very start of boot.
  ipcMain.on("env:resolved-sync", (e) => {
    e.returnValue = payload;
  });

  handle("env:switch", [obj], async (_e, raw) => {
    const { env: wanted, token } = (raw as { env?: unknown; token?: unknown }) ?? {};
    const verdict = classifyEnvChange({
      wanted,
      current,
      // Permission is requested ONLY if the target is STAGING — no network call for
      // a no-op, nor for a return to production or to the user's own stack.
      // Account first (the durable path), machine second (troubleshooting).
      allowed:
        wanted === "staging" && wanted !== current
          ? (await accountIsStagingTester(token)) || (await selfPinAllowed())
          : false,
      customAllowed: CUSTOM_STACK_ALLOWED,
      customConfigured: !!custom,
    });

    if (verdict.kind === "refuse") return { ok: false, reason: verdict.reason, env: current };
    if (verdict.kind === "needs-permission") {
      return { ok: false, reason: "not_privileged", env: current };
    }
    if (verdict.env === current) return { ok: true, env: current, relaunching: false };

    // The entered stack SURVIVES a switch to a baked environment: one click returns to it.
    if (!writeEnvPointer(args.baseUserData, verdict.env, undefined, custom)) {
      // The pointer couldn't be written: do NOT restart, or the app would reopen
      // the old environment with nobody understanding why.
      return { ok: false, reason: "write_failed", env: current };
    }
    void relaunchSafely(() => {
      app.relaunch();
      app.quit();
    });
    return { ok: true, env: verdict.env, relaunching: true };
  });
}
