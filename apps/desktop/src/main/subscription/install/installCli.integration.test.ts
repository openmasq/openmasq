// INTEGRATION test: it downloads the REAL pinned artefacts (~300 MB) from their official
// origins and installs them into a temporary home / userData. So it only runs on request:
//
//   OPENMASQ_TEST_CLI_INSTALL=1 npx vitest run apps/desktop/src/main/subscription/install
//
// What it proves that no pure test can: the pins in `pins.ts` still match what the
// vendors serve, `safeFetch`'s binary path streams a large body to disk intact, the tar
// extractor reads a real release package, and `claude install` places itself without a
// TTY. A mismatch here is the signal to re-pin (and, for codex, to re-measure).
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { installSubscriptionCli } from "./installCli";
import { resolveCli } from "../resolveCli";
import { appCliRoots } from "./installCli";

const enabled = process.env.OPENMASQ_TEST_CLI_INSTALL === "1";
const root = mkdtempSync(join(tmpdir(), "openmasq-cli-install-"));
const home = join(root, "home");
const userData = join(root, "userData");

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe.skipIf(!enabled)("installSubscriptionCli (real downloads)", () => {
  it("installs claude into the temporary home, where resolveCli finds it", async () => {
    const phases: string[] = [];
    const r = await installSubscriptionCli("claude", {
      platform: process.platform,
      arch: process.arch,
      userData,
      home,
      onProgress: (p) => phases.push(p.phase),
    });
    expect(r).toEqual({ ok: true });
    expect(phases[0]).toBe("download");
    expect(phases.at(-1)).toBe("done");
    expect(resolveCli("claude", { platform: process.platform, home })).not.toBeNull();
  }, 20 * 60 * 1000);

  it("installs codex under the app's data dir, where resolveCli probes first", async () => {
    const r = await installSubscriptionCli("codex", { platform: process.platform, arch: process.arch, userData, home });
    expect(r).toEqual({ ok: true });
    const roots = appCliRoots("codex", userData);
    expect(existsSync(join(roots[0], process.platform === "win32" ? "codex.exe" : "codex"))).toBe(true);
    expect(resolveCli("codex", { platform: process.platform, home, extraRoots: roots })?.startsWith(roots[0])).toBe(true);
  }, 20 * 60 * 1000);
});
