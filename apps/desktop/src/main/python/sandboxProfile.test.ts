import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const ud = mkdtempSync(join(tmpdir(), "openmasq-sbx-ud-"));
vi.mock("electron", () => ({ app: { getPath: () => ud, isPackaged: false, getAppPath: () => "/app" } }));
const { seatbeltProfile } = await import("./sandbox");

const scratch = mkdtempSync(join(tmpdir(), "openmasq-sbx-"));
const profile = seatbeltProfile(scratch, 18999);

// The jail runs de-redacted, model-written code. Its only way out is the loopback egress
// proxy; a mach service that can start another process OUTSIDE it (LaunchServices: `open
// <url>` hands the user's browser a URL built from real values) is a way around that.
describe("the macOS jail profile", () => {
  it("grants no mach service wholesale", () => {
    expect(profile).not.toMatch(/^\(allow mach-lookup\)$/m);
    expect(profile).toMatch(/^\(deny default\)$/m);
  });

  it.skipIf(process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec"))(
    "cannot reach LaunchServices from inside (a live sandbox-exec probe)",
    () => {
      const r = spawnSync("/usr/bin/sandbox-exec", ["-p", profile, "/usr/bin/lsappinfo", "front"], {
        encoding: "utf8",
        timeout: 15_000,
      });
      // Reached, it prints the front app's ASN (`ASN:0x…`); cut off, it gets nothing.
      expect(`${r.stdout}${r.stderr}`).not.toMatch(/ASN:0x/);
    },
  );
});
