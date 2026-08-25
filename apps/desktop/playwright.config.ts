import { defineConfig } from "@playwright/test";

/* Real end-to-end tests that launch the built Electron app and drive an actual
   signed-in ChatGPT/Claude web session. The session is reused from a pre-
   authenticated profile (see e2e/README.md) — we never automate the password +
   CAPTCHA login on every run. Network + a real model are involved, so these are
   slow and intentionally NOT part of `pnpm test`; run them nightly or manually. */
export default defineConfig({
  testDir: "./e2e",
  // `*.e2e.ts` are the automated comparison tests; `auth.setup.ts` is the
  // one-shot interactive login. Scripts select which file to run.
  testMatch: /.*\.(e2e|setup)\.ts$/,
  // One app instance at a time by default. E2E_PARALLEL=1 opts into parallel — meant
  // for the workflows suite, which launches ONE ISOLATED app/profile PER test.
  fullyParallel: process.env.E2E_PARALLEL === "1",
  workers: process.env.E2E_PARALLEL === "1" ? Number(process.env.E2E_WORKERS ?? 4) : 1,
  retries: 0,
  reporter: [["list"]],
  // Generous: a turn can wait on a real model reply AND, when Cloudflare throws a
  // challenge, pause for a human to solve it in the webview (up to ~5 min).
  timeout: 600_000,
  expect: { timeout: 120_000 },
});
