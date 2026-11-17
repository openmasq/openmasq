/**
 * Why a CLI could not even START, as a bounded code (`cliFailWire`): the two ways a
 * launch dies before the CLI says a word.
 *
 * 1. The command line is too long. The whole conversation used to ride in argv, and an
 *    OS caps it: Windows' `CreateProcess` at 32 767 UTF-16 units for the WHOLE line,
 *    Linux at 128 KiB for ONE argument (`MAX_ARG_STRLEN`), macOS at `ARG_MAX` (1 MiB,
 *    argv + environment). Past it `spawn` throws `E2BIG`/`ENAMETOOLONG` — synchronously
 *    on macOS (measured) — so the guard checks BEFORE spawning, with a margin, and says
 *    so in the user's language instead of « spawn E2BIG ». The claude prompt now rides on
 *    stdin (`stdin` in `spawnStream.ts`); codex and antigravity still carry it in argv
 *    (their stdin path is not measured), so this guard is what speaks for them.
 * 2. The OS refuses the binary (`ENOENT` removed since detection, `EACCES` not
 *    executable…): a reinstall is the cure, said as such.
 */
import { cliFailWire, type CliFailureCode } from "@openmasq/llm";
import { mainMessages } from "../i18n";
import { CLI_LABEL, type SubscriptionCliId } from "./resolveCli";

/** Room left for quoting, the environment and the CLI's own re-exec. */
const WIN_LINE_BUDGET = 30_000;
const LINUX_ARG_BUDGET = 120_000;
const POSIX_TOTAL_BUDGET = 900_000;

/** True when this command line would not survive the OS's own limit. */
export function argvOverBudget(platform: NodeJS.Platform, binPath: string, args: readonly string[]): boolean {
  if (platform === "win32") {
    // Each argument may gain quotes and escapes: count 3 per argument on top of its length.
    return args.reduce((n, a) => n + a.length + 3, binPath.length) > WIN_LINE_BUDGET;
  }
  const bytes = args.map((a) => Buffer.byteLength(a, "utf8") + 1);
  if (platform === "linux" && bytes.some((b) => b > LINUX_ARG_BUDGET)) return true;
  return bytes.reduce((n, b) => n + b, Buffer.byteLength(binPath)) > POSIX_TOTAL_BUDGET;
}

/** A launch errno → the bounded code; anything unexpected is `spawn_other`, never free text. */
export function spawnFailureCode(errno: string | undefined): CliFailureCode {
  switch (errno) {
    case "E2BIG":
    case "ENAMETOOLONG":
      return "prompt_too_long";
    case "ENOENT":
      return "spawn_missing";
    case "EACCES":
    case "EPERM":
      return "spawn_denied";
    default:
      return "spawn_other";
  }
}

/** The error a failed launch throws: the code, then main's sentence. */
export function launchFailure(cli: SubscriptionCliId, code: CliFailureCode, errno?: string): Error {
  const t = mainMessages().desktopMain.subscription;
  const label = CLI_LABEL[cli];
  const text = code === "prompt_too_long" ? t.promptTooLong(label) : t.spawnFailed(label);
  // An unexpected errno is kept in the sentence (support reads it); it is an OS code, never user data.
  const tail = code === "spawn_other" && errno && /^E[A-Z0-9]{2,15}$/.test(errno) ? ` (${errno})` : "";
  return new Error(cliFailWire(cli, code, text + tail));
}
