/**
 * WHICH `userData` profile this instance opens — a pure decision, tested separately.
 *
 * A profile is the account's SQLite DB, keychain entries, `updates.json`,
 * settings, and the single-instance lock. Two instances that think they own the same
 * folder means a corrupted DB; two ENVIRONMENTS crossing paths there is worse —
 * one environment's vault and provider keys read back by the other.
 *
 * ⚠️ **The bug this closes exists today.** Both builds share `appId`
 * (branding `desktopBundleId`) and `productName` (branding `name`), hence the same default `userData`.
 * Switching an install from staging to production (the preferred switch, which reinstalls
 * the other channel's build) therefore makes the PRODUCTION app open STAGING's vault,
 * conversations and keys. Nothing prevented it.
 *
 * ⚠️ **And production keeps the BARE path — that's the constraint that decides everything
 * else.** Suffixing production too would send every existing install to an empty
 * folder: conversations, vault, keys, account, all "gone" on the next update.
 * The suffix therefore applies only to environments that are NOT production. Staging
 * installs, for their part, start over with a fresh profile — that's test data,
 * and it's the stated price of the separation.
 */
import { DEFAULT_ENV, readEnvPointer, type EnvName } from "./environment";

/** What the profile can be worth. `""` = Electron's default path. */
export type ProfileSuffix = "" | " (Dev)" | " (Staging)" | " (Custom)";

export interface ProfileInput {
  /** This instance's RESOLVED environment — the written pointer if there is one, else
   *  the build's own (`environment.ts`). This is what keeps the profile correct the day
   *  the environment gets chosen at runtime: the folder follows the choice, not the binary. */
  env: EnvName;
  /** `app.isPackaged` — false under `electron-vite dev`. */
  isPackaged: boolean;
}

/**
 * The suffix to append to the default `userData`.
 *
 * Three cases, in this order, and the order is the rule:
 *
 * 1. **Not packaged ⇒ `" (Dev)"`.** A `pnpm dev` and an installed app share
 *    `productName`, hence the same profile: a single instance lock (the second
 *    launch closes) and a single SQLite DB opened twice. Dev wins over
 *    the environment — a dev build against staging already points at localhost
 *    (`.env.development`), it has nothing more to separate.
 * 2. **`staging` environment ⇒ `" (Staging)"`, `custom` ⇒ `" (Custom)"`.** The two that
 *    separate out — the self-hosted stack especially: an entered address must NEVER
 *    read back production's vault and keys (`environments/customStack.ts`).
 * 3. **Otherwise ⇒ `""`.** Production — and ALSO a packaged build with no channel (a
 *    local `pnpm run release`), which resolves to production: it shares this profile
 *    today, and inventing another one for it would move someone's data without
 *    it being asked for.
 */
export function profileSuffix({ env, isPackaged }: ProfileInput): ProfileSuffix {
  if (!isPackaged) return " (Dev)";
  if (env === "staging") return " (Staging)";
  if (env === "custom") return " (Custom)";
  return "";
}

/** The part of `app` this needs — injected rather than imported, so this module
 *  stays testable without Electron (and so the decision above stays one at all). */
/** What the rest of main needs to know once the profile is set. */
export interface ResolvedProfile {
  env: EnvName;
  /** The BASE `userData` folder — where the pointer lives, never the current profile. */
  baseUserData: string;
}

export interface ProfileApp {
  isPackaged: boolean;
  getPath(name: "userData"): string;
  setPath(name: "userData", path: string): void;
}

/**
 * Set THIS instance's profile, and return what the rest of main needs to know:
 * the chosen environment, and the BASE folder — this must be captured BEFORE the
 * `setPath`, since afterward `getPath("userData")` returns the suffixed profile, where
 * the pointer doesn't live. ⚠️ **Must run before `whenReady`** —
 * `userData` is read during Electron's init.
 *
 * `OPENMASQ_USER_DATA_DIR` overrides everything: it's the e2e hook, which points at a
 * disposable, already-authenticated profile — it does NOT change the environment, only the folder.
 * Otherwise: the written pointer if it exists, else the build's environment; then the suffix,
 * and nothing at all when it's empty — the production path is never rewritten with its
 * own value.
 *
 * ⚠️ The pointer is read from the BASE `userData`, so BEFORE any `setPath`: it's the
 * only possible read, since the final folder is what's currently being decided.
 */
export function applyProfilePath(
  app: ProfileApp,
  vars: { OPENMASQ_USER_DATA_DIR?: string },
  readPointer: (base: string, fallback: EnvName) => EnvName = readEnvPointer,
): ResolvedProfile {
  const baseUserData = app.getPath("userData");
  // Without a pointer, the environment is PRODUCTION — never inferred from the channel (the
  // single-artifact contract: a candidate is the real software ahead of time, not a test env).
  const env = readPointer(baseUserData, DEFAULT_ENV);

  if (vars.OPENMASQ_USER_DATA_DIR) {
    app.setPath("userData", vars.OPENMASQ_USER_DATA_DIR);
    return { env, baseUserData };
  }
  const suffix = profileSuffix({ env, isPackaged: app.isPackaged });
  if (suffix) app.setPath("userData", `${baseUserData}${suffix}`);
  return { env, baseUserData };
}
