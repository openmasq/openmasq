import { describe, it, expect } from "vitest";
import { ensureCurrentInReleases, compareVersions } from "./useUpdates";
import type { DesktopRelease } from "../../../host";

const rel = (version: string): DesktopRelease => ({ version });

// The running build must always appear in the history so its release note shows,
// even when the channel feed lists no build for it (a dev build on the empty
// default `desktop-production` channel is the reported case).
describe("ensureCurrentInReleases", () => {
  it("prepends a synthetic row for the current version when the list is empty", () => {
    const out = ensureCurrentInReleases([], "0.3.1");
    expect(out).toEqual([{ version: "0.3.1" }]);
  });

  it("prepends when no EXACT-version row exists (pre-release rows don't count)", () => {
    const out = ensureCurrentInReleases([rel("0.3.1-staging.70"), rel("0.3.0")], "0.3.1");
    expect(out[0]).toEqual({ version: "0.3.1" });
    expect(out).toHaveLength(3);
  });

  it("does NOT duplicate when an exact-version row is already present", () => {
    const list = [rel("0.3.1"), rel("0.3.0")];
    expect(ensureCurrentInReleases(list, "0.3.1")).toBe(list);
  });

  it("returns the list unchanged when there is no current version", () => {
    const list = [rel("0.3.0")];
    expect(ensureCurrentInReleases(list, undefined)).toBe(list);
  });
});

describe("compareVersions", () => {
  it("orders by major.minor.patch, ignoring pre-release suffixes", () => {
    expect(compareVersions("0.3.1", "0.3.0")).toBeGreaterThan(0);
    expect(compareVersions("0.3.1-staging.70", "0.3.1")).toBe(0);
    expect(compareVersions("0.2.9", "0.3.0")).toBeLessThan(0);
  });
});
