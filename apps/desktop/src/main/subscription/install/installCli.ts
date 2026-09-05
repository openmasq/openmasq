/**
 * Installing a subscription CLI from inside the app, for someone who will never open a
 * terminal. Download the pinned artefact (`pins.ts`, `download.ts`), then:
 *
 * - **claude**: the file IS the CLI. `chmod 755`, then run ITS OWN `install` — measured
 *   on 2.1.261: non-interactive, exit 0, creates `~/.local/bin/claude` → its
 *   `~/.local/share/claude/versions/<v>` copy, touches no shell rc file. That is the
 *   official installer's exact last step (`install.sh`), so the layout is the one
 *   `resolveCli` already probes, the one the CLI's own updater maintains, and the one
 *   the user's terminal finds too. The downloaded file is then removed.
 * - **codex**: a tarball, extracted under the APP's data dir
 *   (`<userData>/cli/codex/<version>/`), never into the user's PATH — the version the
 *   engine measured is ours to hold; `resolveCli` probes this root FIRST. Extraction is
 *   fail-closed (`tarExtract.ts`) into a `.partial` sibling, renamed only when complete.
 *
 * One install per CLI at a time (`busy`), progress relayed to the caller, and every
 * failure is a CODE (the interface has the words) — never a sentence from a server.
 */
import { spawn } from "node:child_process";
import { chmodSync, createReadStream, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createGunzip } from "node:zlib";
import type { SubscriptionCli, SubscriptionInstallProgress, SubscriptionSetupResult } from "@openmasq/llm";
import { minimalChildEnv } from "../../childEnv";
import { PinMismatchError, downloadPinned } from "./download";
import { CODEX_PIN_VERSION, installPin } from "./pins";
import { extractTar } from "./tarExtract";

const CLAUDE_INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

export interface InstallContext {
  platform: NodeJS.Platform;
  arch: string;
  /** The app's own data dir: codex lives under it, and so do the temporary downloads. */
  userData: string;
  /** The home `claude install` writes its launcher under (`~/.local/bin`). */
  home: string;
  onProgress?: (p: SubscriptionInstallProgress) => void;
}

/** Where this app keeps the codex IT installed. */
export function codexInstallRoot(userData: string): string {
  return join(userData, "cli", "codex", CODEX_PIN_VERSION);
}

/** The app-owned roots `resolveCli` probes BEFORE the PATH for `cli` (empty for claude:
 *  it installs into the official location, which is already among the known roots). */
export function appCliRoots(cli: SubscriptionCli, userData: string): string[] {
  return cli === "codex" ? [join(codexInstallRoot(userData), "bin")] : [];
}

const inFlight = new Set<SubscriptionCli>();

export async function installSubscriptionCli(
  cli: SubscriptionCli,
  ctx: InstallContext,
): Promise<SubscriptionSetupResult> {
  if (inFlight.has(cli)) return { ok: false, error: "busy" };
  inFlight.add(cli);
  try {
    return await run(cli, ctx);
  } finally {
    inFlight.delete(cli);
  }
}

async function run(cli: SubscriptionCli, ctx: InstallContext): Promise<SubscriptionSetupResult> {
  const pin = installPin(cli, ctx.platform, ctx.arch);
  if (!pin) return { ok: false, error: "unsupported" };
  const tmpRoot = join(ctx.userData, "cli", "tmp");
  mkdirSync(tmpRoot, { recursive: true });
  const tmpDir = mkdtempSync(join(tmpRoot, `${cli}-`));
  const file = join(tmpDir, pin.layout === "tgz" ? "package.tgz" : pin.url.slice(pin.url.lastIndexOf("/") + 1));
  try {
    ctx.onProgress?.({ cli, phase: "download", received: 0, total: pin.size });
    try {
      await downloadPinned(pin, file, (received, total) =>
        ctx.onProgress?.({ cli, phase: "download", received, total }),
      );
    } catch (e) {
      return { ok: false, error: e instanceof PinMismatchError ? "checksum" : "network" };
    }
    ctx.onProgress?.({ cli, phase: "install" });
    if (pin.layout === "binary") await installClaude(file, tmpDir, ctx.home);
    else await installCodex(file, codexInstallRoot(ctx.userData), ctx.platform);
    ctx.onProgress?.({ cli, phase: "done" });
    return { ok: true };
  } catch {
    return { ok: false, error: "install" };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** `<binary> install`: the CLI places itself. Bounded; a non-zero exit rejects. */
function installClaude(binary: string, cwd: string, home: string): Promise<void> {
  chmodSync(binary, 0o755);
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["install"], {
      cwd,
      env: minimalChildEnv({ HOME: home }),
      stdio: ["ignore", "ignore", "ignore"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude install: timeout"));
    }, CLAUDE_INSTALL_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`claude install: exit ${code}`));
    });
  });
}

async function installCodex(tgz: string, dest: string, platform: NodeJS.Platform): Promise<void> {
  const partial = `${dest}.partial`;
  rmSync(partial, { recursive: true, force: true });
  await extractTar(createReadStream(tgz).pipe(createGunzip()), partial);
  const bin = join(partial, "bin", platform === "win32" ? "codex.exe" : "codex");
  if (!existsSync(bin)) {
    rmSync(partial, { recursive: true, force: true });
    throw new Error("codex package: no binary at bin/codex");
  }
  rmSync(dest, { recursive: true, force: true });
  renameSync(partial, dest);
}
