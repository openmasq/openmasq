// `openmasq-proxy console` — open the live view of the proxy that is running, from any
// terminal, at any moment. A wrapped tool owns the screen, and hermes and claude both clear
// it as they start, card and URL included; this is the shortcut that survives that. It is
// meant to be BOUND: to a key in the terminal (tmux, kitty, iTerm2), or typed as
// `!openmasq-proxy console` in claude, opencode and hermes — all three run a line that starts
// with `!` as a shell command, without sending it to the model.
//
// It trusts the link only as far as the proxy behind it answers (`findRunning`: it has to
// NAME itself); a link nothing answers for is forgotten, not opened.
import { findRunning } from "../../lib/attach.js";
import { openInBrowser } from "../../lib/openUrl.js";
import { consoleLinkPath, readConsoleLink, withdrawConsoleLink } from "./link.js";

export const CONSOLE_USAGE = `openmasq-proxy console [--url]

  opens the live view of the running proxy in the system browser
  --url                  print its address instead (for a script, or a keybinding that opens
                         it itself)

The address is what the proxy wrote to ~/.openmasq/console.url when it started with
--console (0600, removed when it exits). Bind the command to a key — tmux:
bind-key o run-shell "openmasq-proxy console" — or type !openmasq-proxy console in the
tool's own prompt: claude, opencode and hermes run a line starting with ! as a shell command.`;

export interface ConsoleCommandDeps {
  path?: string;
  find?: typeof findRunning;
  open?: (url: string) => Promise<boolean>;
  /** The operator's line (stderr) and the machine-read one (`--url`, stdout). */
  say?: (text: string) => void;
  out?: (text: string) => void;
}

export async function runConsoleCommand(
  argv: string[],
  deps: ConsoleCommandDeps = {},
): Promise<number> {
  const say = deps.say ?? ((t) => console.error(t));
  const out = deps.out ?? ((t) => console.log(t));
  if (argv.includes("--help") || argv.includes("-h")) {
    out(CONSOLE_USAGE);
    return 0;
  }
  const unknown = argv.find((a) => a !== "--url");
  if (unknown) {
    say(`unknown option ${unknown}\n\n${CONSOLE_USAGE}`);
    return 2;
  }
  const path = deps.path ?? consoleLinkPath();
  const link = readConsoleLink(path);
  if (!link) {
    say(
      "no live view to open: no proxy started with --console is running here (--open starts one and opens it).",
    );
    return 1;
  }
  const origin = new URL(link).origin;
  const running = await (deps.find ?? findRunning)(origin);
  if (!running || running.console === false) {
    // Stale: the proxy that wrote it is gone, or what listens there serves no console now.
    withdrawConsoleLink(path);
    say(
      running
        ? `the proxy on ${origin} runs without --console — nothing to open.`
        : `the proxy that served the live view on ${origin} is gone — its address is forgotten.`,
    );
    return 1;
  }
  if (argv.includes("--url")) {
    out(link);
    return 0;
  }
  if (!(await (deps.open ?? openInBrowser)(link))) {
    say(`could not open a browser here — open it by hand: ${link}`);
    return 1;
  }
  say(`live view opened — the proxy on ${origin} (v${running.version})`);
  return 0;
}
