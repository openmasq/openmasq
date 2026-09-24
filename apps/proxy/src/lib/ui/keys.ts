// Keyboard control of a running proxy, on an interactive terminal only: the dials that are
// safe to turn at runtime (level, what the model sees, what is printed), the env lines to the
// clipboard, the summary so far. Nothing here loosens a boundary: every key keeps the proxy
// masking; a level change is the app's own level arithmetic.
import { spawn } from "node:child_process";
import type { RedactionLevel } from "@openmasq/catalog";
import type { KeyHint } from "./banner.js";
import type { Reporter } from "./reporter.js";

export interface KeyActions {
  /** The level after the change, or `refused` with the reason it could not be applied. */
  cycleLevel(): Promise<{ level: RedactionLevel; refused?: string }>;
  toggleMode(): "fake" | "token";
  /** Show the real value behind each substitute, on this terminal only. */
  toggleReveal(): boolean;
  envLines(): string[];
  quit(): void;
}

export const KEY_HINTS: KeyHint[] = [
  { key: "l", label: "level" },
  { key: "m", label: "tokens" },
  { key: "f", label: "values" },
  { key: "c", label: "copy" },
  { key: "s", label: "summary" },
  { key: "x", label: "clear" },
  { key: "?", label: "keys" },
  { key: "q", label: "quit" },
];

const CTRL_C = String.fromCharCode(3);

/** Copy `text` with the platform's clipboard tool; false when none answered. */
export function copyToClipboard(text: string, platform = process.platform): Promise<boolean> {
  const cmd =
    platform === "darwin"
      ? ["pbcopy"]
      : platform === "win32"
        ? ["clip"]
        : process.env.WAYLAND_DISPLAY
          ? ["wl-copy"]
          : ["xclip", "-selection", "clipboard"];
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd[0], cmd.slice(1), { stdio: ["pipe", "ignore", "ignore"] });
      p.on("error", () => resolve(false));
      p.on("exit", (code) => resolve(code === 0));
      p.stdin.end(text);
    } catch {
      resolve(false);
    }
  });
}

/** One key → what happens. Exported for the test; `attachKeys` binds it to stdin. */
export async function handleKey(
  key: string,
  reporter: Reporter,
  actions: KeyActions,
): Promise<void> {
  switch (key) {
    case "l": {
      const r = await actions.cycleLevel();
      if (r.refused) reporter.note(r.refused, "warn");
      else reporter.note(`level → ${r.level}`, "ok");
      break;
    }
    case "m":
      reporter.note(
        `the model now sees ${actions.toggleMode() === "token" ? "opaque tokens" : "believable fakes"}`,
        "ok",
      );
      break;
    case "f":
      if (actions.toggleReveal())
        reporter.note("showing what each value became — real data on this screen", "warn");
      else reporter.note("values hidden again", "ok");
      break;
    case "c": {
      const lines = actions.envLines();
      const ok = await copyToClipboard(`${lines.map((l) => `export ${l}`).join("\n")}\n`);
      if (ok) reporter.note("env lines copied — paste them in the tool's shell", "ok");
      else for (const l of lines) reporter.note(`export ${l}`);
      break;
    }
    case "s":
      reporter.summary();
      break;
    case "x":
      reporter.clear();
      break;
    case "?":
      reporter.keys(KEY_HINTS);
      break;
    case "q":
    case CTRL_C:
      actions.quit();
      break;
    default:
      break;
  }
}

/** Wire the keys; returns a detach function. No-op off a TTY. */
export function attachKeys(
  reporter: Reporter,
  actions: KeyActions,
  stdin: NodeJS.ReadStream = process.stdin,
): () => void {
  if (!stdin.isTTY) return () => {};
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  const onKey = (key: string) => void handleKey(key, reporter, actions);
  stdin.on("data", onKey);
  return () => {
    stdin.off("data", onKey);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
  };
}
