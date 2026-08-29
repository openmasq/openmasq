/**
 * `@sentry/electron/{main,renderer}` as seen by the UNIT SUITE — a stub, same contract as
 * `vitest.electron-stub.ts` (read its header: the download race).
 *
 * The real package can NOT live here: externalized, its internal `electron` import bypasses
 * the alias (Node resolver) and hits the string module; inlined, its module init reads
 * `process.versions.electron` and throws outside Electron. Yet it is imported by MAIN files
 * the suite tests (`runtime/errorReport.ts`, `sentry/main.ts`).
 *
 * Every function THROWS when called, dictating the `vi.mock` to write: a test that really
 * touches Sentry must declare it — a silent no-op would make an error path that reports
 * nothing look green.
 */
const boom = (name: string) => (): never => {
  throw new Error(
    `@sentry/electron.${name} — the unit suite has NO Sentry (stub: ` +
      `scripts/vitest.sentry-electron-stub.ts). Declare what this test needs:\n` +
      `  vi.mock("@sentry/electron/main", () => ({ ${name}: vi.fn() }));`,
  );
};

export const init = boom("init");
export const captureException = boom("captureException");
export const captureMessage = boom("captureMessage");
export const setUser = boom("setUser");
export const setTag = boom("setTag");
export const addBreadcrumb = boom("addBreadcrumb");
export const flush = boom("flush");
export const close = boom("close");
export const getClient = boom("getClient");
// The integration factories are called while ASSEMBLING the config (before any `init`):
// they return an inert marker rather than throwing — `init` is what throws.
export const childProcessIntegration = () => ({ name: "stub:childProcess" });
export const linkedErrorsIntegration = () => ({ name: "stub:linkedErrors" });
export const normalizePathsIntegration = () => ({ name: "stub:normalizePaths" });
export const onUncaughtExceptionIntegration = () => ({ name: "stub:onUncaughtException" });
export const onUnhandledRejectionIntegration = () => ({ name: "stub:onUnhandledRejection" });
export const browserTracingIntegration = () => ({ name: "stub:browserTracing" });
