import type { SubscriptionCli, SubscriptionSetupError } from "@openmasq/llm";

/**
 * What the app INSTALLS while it runs, as product events — emitted by the MAIN process
 * (`apps/desktop/src/main/runtime/installTrack.ts` → the `app:event` bridge). Codes,
 * phases and durations only: never a path, a URL, an account, nor a CLI's own output.
 *
 * A `*_start` precedes each result so an install that never ENDS (the app quit mid-download,
 * a sign-in page left open) still shows as a start with no result, not as nothing.
 */

/** Where an install stopped: the last phase it REACHED (`done` on success). */
type CliInstallStage = "start" | "download" | "verify" | "install" | "done";

/** How a CLI's own sign-in ended. `failed` = it exited non-zero (refused, closed callback);
 *  `cancelled` = the person (or a new attempt) stopped it; `spawn_error` = it never ran. */
type CliLoginOutcome = "ok" | "failed" | "timeout" | "cancelled" | "spawn_error" | "no_cli" | "unsupported";

/** Where the Python runtime came from: shipped in the app, already prepared, its wheels
 *  topped up, or downloaded now. */
type PythonRuntimeSource = "bundled" | "cached" | "topped_up" | "downloaded";

type PythonRuntimeStage = "start" | "download" | "extract" | "install" | "ready";

export type InstallEvent =
  // What a set-up card READ for a CLI: is it here, is it signed in. Once per distinct answer
  // per session — the step `access: agent` cannot tell (an agent counts as access unsigned).
  | { name: "cli_status"; cli: SubscriptionCli; installed: boolean; logged_in: "yes" | "no" | "unknown" }
  | { name: "cli_install_start"; cli: SubscriptionCli }
  | {
      name: "cli_install";
      cli: SubscriptionCli;
      outcome: "ok" | Exclude<SubscriptionSetupError, "login" | "busy">;
      stage: CliInstallStage;
      duration: number;
    }
  | { name: "cli_login_start"; cli: SubscriptionCli }
  // `url_shown` = the sign-in page was relayed to the person: false with `failed` means the
  // CLI died before it ever printed one.
  | { name: "cli_login"; cli: SubscriptionCli; outcome: CliLoginOutcome; url_shown: boolean; duration: number }
  // The FIRST preparation of the runtime this session (success), or each distinct failure.
  | {
      name: "python_runtime";
      source: PythonRuntimeSource;
      outcome: "ok" | "error";
      stage: PythonRuntimeStage;
      duration: number;
    };
