/**
 * Where to find a subscription CLI's binary — and why `PATH` is NEVER enough.
 *
 * The app launched from the Finder (the case for every user, as opposed to
 * `pnpm dev`) does not inherit the shell's `PATH`: macOS gives it `/usr/bin:/bin:
 * /usr/sbin:/sbin` and nothing more. Yet `claude` installs into `~/.local/bin`,
 * `codex` via npm global or Homebrew — none of these directories are in
 * that minimal PATH. This is THE bug of this family: detection works in dev (launched
 * from a terminal, full PATH) and fails for the user, with no useful message.
 *
 * So we probe known roots IN ADDITION to PATH. We do NOT spawn a login
 * shell to recover the real PATH: spawning `zsh -lc` runs the user's
 * rc files, i.e. arbitrary third-party code, from the privileged process — rule
 * 7 forbids it, and the gain (a few exotic installs) isn't worth the surface.
 *
 * ⚠️ This module does NOT say whether the CLI is authenticated, only whether it exists and
 * is executable. Auth is observed at use time (see `engine.ts`): a CLI installed but
 * never connected fails on the first send, and that's the message to show.
 */
import { accessSync, constants } from "node:fs";
import { posix, win32 } from "node:path";

export type SubscriptionCliId = "claude" | "codex";

/** The binary name per CLI. Windows resolves via `WINDOWS_EXTS`. */
const BIN_NAME: Record<SubscriptionCliId, string> = {
  claude: "claude",
  codex: "codex",
};

/** On Windows an npm binary is a `.cmd`; `spawn` doesn't complete it on its own. */
const WINDOWS_EXTS = ["", ".cmd", ".exe", ".bat", ".ps1"] as const;

/**
 * Known install roots, outside PATH. Order = probing priority.
 * `~` is resolved by the caller (we take `home` as input to stay pure/testable).
 */
/**
 * The path primitives of the TARGET platform, not the host's. Without that the
 * function lies about its signature: it takes `platform` as a parameter but would compute
 * with the executing machine's semantics — a `C:\\…` judged "relative" on macOS
 * (so discarded), and a Windows `PATH` split on `:` instead of `;`, which cuts
 * each entry in two at the drive letter.
 */
function pathApi(platform: NodeJS.Platform) {
  return platform === "win32" ? win32 : posix;
}

function knownRoots(platform: NodeJS.Platform, home: string): string[] {
  const { join } = pathApi(platform);
  if (platform === "win32") {
    return [
      join(home, "AppData", "Roaming", "npm"),
      join(home, "AppData", "Local", "Programs"),
      join(home, ".local", "bin"),
    ];
  }
  return [
    join(home, ".local", "bin"), // claude (official installer)
    join(home, ".claude", "local"), // claude (historic "local" install)
    "/opt/homebrew/bin", // Homebrew Apple Silicon — absent from the Finder PATH
    "/usr/local/bin", // Homebrew Intel + npm global
    join(home, ".npm-global", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".bun", "bin"),
    "/usr/bin",
  ];
}

export interface CandidateOptions {
  platform: NodeJS.Platform;
  home: string;
  /** The process's `PATH`. Empty/absent is the NORMAL case under the Finder, not an error. */
  path?: string;
}

/**
 * The absolute paths to probe, in order — PATH first (if the user has
 * overridden their install, we respect it), then the known roots. Pure: this is what
 * `resolveCli.test.ts` pins, without touching the real filesystem.
 */
export function candidatePaths(cli: SubscriptionCliId, opts: CandidateOptions): string[] {
  const { join, isAbsolute, delimiter } = pathApi(opts.platform);
  const bin = BIN_NAME[cli];
  const exts = opts.platform === "win32" ? WINDOWS_EXTS : ([""] as const);
  const dirs = [
    ...(opts.path ? opts.path.split(delimiter).filter(Boolean) : []),
    ...knownRoots(opts.platform, opts.home),
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dirs) {
    if (!isAbsolute(dir)) continue; // a relative PATH is an attack vector, not an install
    for (const ext of exts) {
      const full = join(dir, `${bin}${ext}`);
      if (seen.has(full)) continue;
      seen.add(full);
      out.push(full);
    }
  }
  return out;
}

/** True if the path exists AND is executable. Isolated so it can be stubbed in tests. */
export type ExecutableProbe = (path: string) => boolean;

export const defaultProbe: ExecutableProbe = (path) => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * The first executable candidate, or `null`. `null` = "CLI absent", a NORMAL state
 * that should produce an install prompt in the UI — never a technical error.
 */
export function resolveCli(
  cli: SubscriptionCliId,
  opts: CandidateOptions,
  probe: ExecutableProbe = defaultProbe,
): string | null {
  for (const candidate of candidatePaths(cli, opts)) {
    if (probe(candidate)) return candidate;
  }
  return null;
}
