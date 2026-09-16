/**
 * WHICH `userData` profile this instance opens: a pure decision, tested separately. A
 * profile is the DB, keychain entries, settings and the single-instance lock. Two
 * ENVIRONMENTS sharing one means one environment's vault and keys read back by the other.
 *
 * ⚠️ Production keeps the BARE path: suffixing it would send every existing install to an
 * empty folder. The suffix applies only to the other environments, whose installs start
 * over with a fresh profile (test data, the stated price).
 */
import { DEFAULT_ENV, readEnvPointer, type EnvName } from "./environment";

/** What the profile can be worth. `""` = Electron's default path. */
export type ProfileSuffix = "" | " (Dev)" | " (Staging)" | " (Custom)";

export interface ProfileInput {
  /** The RESOLVED environment (`environment.ts`): the folder follows the choice, not the binary. */
  env: EnvName;
  /** `app.isPackaged` — false under `electron-vite dev`. */
  isPackaged: boolean;
}

/**
 * The suffix, three cases in this order (the order is the rule):
 * 1. Not packaged ⇒ `" (Dev)"`: `pnpm dev` and an installed app share `productName`,
 *    hence the lock and the DB. Dev wins over the environment.
 * 2. `staging` ⇒ `" (Staging)"`, `custom` ⇒ `" (Custom)"`: an entered address must NEVER
 *    read back production's vault (`environments/customStack.ts`).
 * 3. Otherwise `""`: production, and a packaged build with no channel, which resolves to it.
 */
export function profileSuffix({ env, isPackaged }: ProfileInput): ProfileSuffix {
  if (!isPackaged) return " (Dev)";
  if (env === "staging") return " (Staging)";
  if (env === "custom") return " (Custom)";
  return "";
}

/** What the rest of main needs to know once the profile is set. */
export interface ResolvedProfile {
  env: EnvName;
  /** The BASE `userData` folder — where the pointer lives, never the current profile. */
  baseUserData: string;
}

/** The part of `app` this needs, injected so the module stays testable without Electron. */
export interface ProfileApp {
  isPackaged: boolean;
  getPath(name: "userData"): string;
  setPath(name: "userData", path: string): void;
}

/**
 * Set THIS instance's profile. The BASE folder is captured BEFORE `setPath` (the pointer
 * lives there, not in the suffixed profile). ⚠️ Must run before `whenReady`.
 * `OPENMASQ_USER_DATA_DIR` (the e2e hook) overrides the folder, not the environment.
 * The production path is never rewritten with its own value.
 */
export function applyProfilePath(
  app: ProfileApp,
  vars: { OPENMASQ_USER_DATA_DIR?: string },
  readPointer: (base: string, fallback: EnvName) => EnvName = readEnvPointer,
): ResolvedProfile {
  const baseUserData = app.getPath("userData");
  // Without a pointer, PRODUCTION: never inferred from the channel.
  const env = readPointer(baseUserData, DEFAULT_ENV);

  if (vars.OPENMASQ_USER_DATA_DIR) {
    app.setPath("userData", vars.OPENMASQ_USER_DATA_DIR);
    return { env, baseUserData };
  }
  const suffix = profileSuffix({ env, isPackaged: app.isPackaged });
  if (suffix) app.setPath("userData", `${baseUserData}${suffix}`);
  return { env, baseUserData };
}
