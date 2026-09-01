import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { resolve } from "node:path";

// Anchored on THIS FILE, never on cwd: launched from anywhere else (repo root, an
// IDE runner), `electron <cwd>` pops the native « Unable to find Electron app at … »
// dialog — pointed at a directory with no `main`. `__dirname` works here because
// Playwright CJS-transforms the spec files (import.meta is what breaks, not __dirname).
const DESKTOP_DIR = resolve(__dirname, "..");

/** Where the Electron test profile lives. Override with OPENMASQ_USER_DATA_DIR. */
export const PROFILE_DIR =
  process.env.OPENMASQ_USER_DATA_DIR || resolve(DESKTOP_DIR, "e2e/.profile");

/** Launch the built app. `useDefaultProfile` runs against the user's REAL profile.
 *  The DB is disabled either way so tests seed settings via localStorage without
 *  the DB hydrating over them (and without writing to the real DB). */
export async function launchApp(
  opts: { useDefaultProfile?: boolean } = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = {
    ...process.env,
    NODE_ENV: "production",
    OPENMASQ_DISABLE_DB: "1",
    OPENMASQ_E2E: "1",
  };
  if (!opts.useDefaultProfile) env.OPENMASQ_USER_DATA_DIR = PROFILE_DIR;
  const app = await electron.launch({ args: [DESKTOP_DIR], cwd: DESKTOP_DIR, env });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

/** Absolute path of the running app's Electron userData dir. */
export async function userDataPath(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ app }) => app.getPath("userData"));
}

// The gestures on an open page live in `pageActions.ts` — the `parcours/`
// driver runs in ESM and cannot import THIS file (`__dirname`).
// Re-exported here so existing specs don't have to change anything.
export {
  sendPrompt,
  appUserText,
  appAnswerText,
  appRedactionMarkCount,
  awaitReply,
  EMAIL_RE,
} from "./pageActions";
