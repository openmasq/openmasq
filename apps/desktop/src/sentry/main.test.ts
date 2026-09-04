// `defaultIntegrations: false` is the single line holding back `SentryMinidump` — a native
// crash dump is the process's MEMORY, uploaded as a BINARY attachment that `beforeSend`
// never sees and `scrubEvent` therefore cannot reconstruct: the vault, the provider keys,
// the plaintext prompts. `policy.test.ts` pins what a scrubbed EVENT may carry; nothing
// pinned the options that decide what else is collected alongside it, so an SDK upgrade or
// a well-meaning "let's re-enable the defaults" would flip it silently and green.
//
// This file pins the four options that are load-bearing, by asserting on what `init`
// actually receives.
import { describe, it, expect, vi } from "vitest";

// A distributed build (packaged + a CI-baked channel) is the only kind that reports —
// `gate.ts`. Set BEFORE the dynamic import: both are read at module load.
process.env.OPENMASQ_SENTRY_DSN = "https://public@o0.ingest.sentry.io/1";
process.env.VITE_UPDATES_CHANNEL = "desktop-stable";

const init = vi.fn();
const integration = (name: string) => () => ({ name });
vi.mock("@sentry/electron/main", () => ({
  init: (opts: unknown) => init(opts),
  onUncaughtExceptionIntegration: integration("OnUncaughtException"),
  onUnhandledRejectionIntegration: integration("OnUnhandledRejection"),
  childProcessIntegration: integration("ChildProcess"),
  linkedErrorsIntegration: integration("LinkedErrors"),
  normalizePathsIntegration: integration("NormalizePaths"),
}));
vi.mock("electron", () => ({ app: { getVersion: () => "9.9.9" } }));

const { initSentryMain } = await import("./main");

/** The options object `initSentryMain` hands the SDK for a distributed build. */
function options(): Record<string, unknown> {
  init.mockClear();
  initSentryMain("app", true);
  expect(init).toHaveBeenCalledTimes(1);
  return init.mock.calls[0][0] as Record<string, unknown>;
}

describe("the Sentry init options are a decision, not a default", () => {
  it("refuses the SDK's default integrations — the minidump is not scrubbable", () => {
    expect(options().defaultIntegrations).toBe(false);
  });

  it("enumerates the integrations it DOES want, and none of them collects content", () => {
    const names = (options().integrations as { name: string }[]).map((i) => i.name);
    expect(names).toEqual([
      "OnUncaughtException",
      "OnUnhandledRejection",
      "ChildProcess",
      "LinkedErrors",
      "NormalizePaths",
    ]);
    // The ones whose whole job is to attach real data.
    for (const banned of [
      "SentryMinidump",
      "LocalVariables",
      "ContextLines",
      "Screenshots",
      "Console",
      "ElectronBreadcrumbs",
      "ElectronNet",
    ]) {
      expect(names).not.toContain(banned);
    }
  });

  it("builds no breadcrumbs at all — visited URLs, clicked element text, console lines", () => {
    const beforeBreadcrumb = options().beforeBreadcrumb as (b: unknown) => unknown;
    expect(beforeBreadcrumb({ category: "console", message: "Marie Morvan" })).toBeNull();
  });

  it("sends no performance traces — they name routes and queries", () => {
    expect(options().tracesSampleRate).toBe(0);
  });

  it("sends no default PII — no IP, no cookies, no headers", () => {
    expect(options().sendDefaultPii).toBe(false);
  });

  it("routes every event through the allow-list reconstruction", () => {
    const beforeSend = options().beforeSend as (e: unknown) => unknown;
    // An event carrying a field the allow-list doesn't know comes back without it.
    const out = beforeSend({
      message: "boom",
      breadcrumbs: [{ message: "https://drive.example.com/x/Marie.pdf" }],
      server_name: "MacBook-de-Marie",
    }) as Record<string, unknown>;
    expect(out.message).toBe("boom");
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.server_name).toBeUndefined();
  });

  it("does not initialise at all for a build that may not report (gate.ts)", () => {
    init.mockClear();
    initSentryMain("app", false); // not packaged ⇒ `dev`
    expect(init).not.toHaveBeenCalled();
  });
});
