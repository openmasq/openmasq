import { app } from "electron";

/**
 * ⚠️ SECURITY (rule 7): a launch-env switch that GRANTS A CAPABILITY must not be
 * honoured by a packaged build.
 *
 * The threat is not the developer, it is anyone who can set the app's launch
 * environment on the user's machine — `launchctl setenv`, a LaunchAgent, an edited
 * `.desktop` file or shortcut, a user-scope Windows env var. None of that needs admin.
 * Once the switch is honoured, it acts *inside* a Developer-ID-signed, notarized,
 * hardened-runtime bundle, inheriting its TCC grants and its keychain ACL entry — the
 * attacker borrows the app's identity rather than bringing their own.
 *
 * `dbCrypto.ts` reached this conclusion first for `OPENMASQ_DB_PLAINTEXT`; this helper
 * is that reasoning made reusable, so the next hook is gated by construction instead of
 * by whoever remembers. Hooks that grant nothing (a log VERBOSITY, a UI flag) do not
 * need it — the test in `devOnly.test.ts` names the exceptions explicitly, so adding a
 * capability hook without a gate fails CI rather than shipping.
 *
 * Returns the value only outside a packaged build; `undefined` everywhere else.
 */
export function devOnly(value: string | undefined): string | undefined {
  return app.isPackaged ? undefined : value;
}
