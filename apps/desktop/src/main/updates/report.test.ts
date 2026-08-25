import { describe, expect, it, vi } from "vitest";

// Two bugs this pins, both of which made a REPORTED updater failure undiagnosable:
//  1. electron-updater throws builder-util-runtime's `HttpError`, whose field is
//     `statusCode`; reading `.status` meant the feed's HTTP status was always absent.
//  2. `captureError` scrubs then truncates the message at 200 chars, and electron-
//     updater's own text is longer than that — so context APPENDED to it never left the
//     machine. It must come first.

vi.mock("electron", () => ({ app: { getVersion: () => "0.3.2" } }));
vi.mock("./config", () => ({ getConfig: () => ({ channel: "desktop-production" }) }));

import { reportUpdateFailure } from "./report";

/** The real 404 electron-updater raises when the Worker feed serves no manifest — long
 *  enough on its own to blow past the 200-char truncation. */
const FEED_404 = Object.assign(
  new Error(
    'Cannot find channel "latest-mac.yml" update info: HttpError: 404 \n' +
      `"method: GET url: https://updates.example.invalid/desktop/desktop-production?device=abc\n\n` +
      'Please double check that your authentication token is correct. Due to security reasons ' +
      'the response body is not included."',
  ),
  { statusCode: 404 },
);

// Mirrors `scrubMessage`'s `.slice(0, 200)` (pinned on its own side in
// packages/ui/src/analytics/errorTracking.test.ts).
const TRUNCATE = 200;

describe("reportUpdateFailure", () => {
  it("reports a specific code and reads the status off `statusCode`", () => {
    const report = vi.fn();
    reportUpdateFailure(report, "download-404", FEED_404, { version: "0.3.3" });
    const [code, err] = report.mock.calls[0] as [string, Error];
    expect(code).toBe("updater-download-404");
    expect(err.message).toContain("http=404");
  });

  it("keeps the whole context inside the first 200 chars (it used to be truncated away)", () => {
    const report = vi.fn();
    reportUpdateFailure(report, "download-404", FEED_404, { version: "0.3.3" });
    const head = (report.mock.calls[0][1] as Error).message.slice(0, TRUNCATE);
    expect(head).toContain("running=0.3.2");
    expect(head).toContain("target=0.3.3");
    expect(head).toContain("ch=desktop-production");
    expect(head).toContain("http=404");
  });

  it("never sets `status` on the error — a 401/403 would be dropped as operational", () => {
    const report = vi.fn();
    const rejected = Object.assign(new Error("HttpError: 403 Forbidden"), { statusCode: 403 });
    reportUpdateFailure(report, "download-403", rejected);
    const err = report.mock.calls[0][1] as Error & { status?: number };
    expect(err.status).toBeUndefined();
    expect(err.message).toContain("http=403");
  });

  it("still reports with no error object at all (context only)", () => {
    const report = vi.fn();
    reportUpdateFailure(report, "no_space", null);
    const [code, err] = report.mock.calls[0] as [string, Error];
    expect(code).toBe("updater-no_space");
    expect(err.message).toBe("running=0.3.2 ch=desktop-production");
  });
});
