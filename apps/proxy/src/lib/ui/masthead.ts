// The masthead of a SUBCOMMAND — `config show`, `mcp status`, `console`, `--help`: the same
// identity as the card that opens a run (`mark.ts`), in one row instead of three, because a
// command that prints a table and exits has no screen to hold. One row of the mark, the
// name, the command, the version; a hairline; then the command's own lines.
//
//   ███████   OpenMasq proxy · config show                              v0.1.0
//   ─────────────────────────────────────────────────────────────────────────
//
// It goes to STDERR, and only when stderr is a terminal: a command's stdout is what a pipe
// or a redirect reads (`config show --json | jq`, `config schema > file`, `console --url`),
// and a masthead in it would be noise in the data. A pipe gets nothing, which is right.
import { colorsWanted, createTty, type Tty } from "./tty.js";
import type { ThemeChoice } from "./theme.js";

/** Columns of the mark row — the same as the card's (`mark.ts`). */
const MARK_W = 9;

export function mastheadRows(tty: Tty, command: string, version: string): string[] {
  const name = `${tty.bold("OpenMasq")} ${tty.dim("proxy")} ${tty.dim("·")} ${tty.bold(command)}`;
  const tag = tty.dim(`v${version}`);
  const width = Math.max(40, Math.min(tty.columns, 96));
  if (!tty.colors) return [`  ${tty.strip(name)}  ${tty.strip(tag)}`, ""];
  const mark = tty.fill(tty.theme.brand, tty.theme.inkOnBrand, MARK_W, () => " ███████ ");
  const room = width - MARK_W - 4;
  const gap = Math.max(2, room - tty.width(name) - tty.width(tag));
  const line =
    tty.width(name) + tty.width(tag) + 2 <= room
      ? `${name}${" ".repeat(gap)}${tag}`
      : tty.fit(name, room);
  // A blank after the rule: the command's first line is a table row or a path, not a title.
  return [`  ${mark}  ${line}`, `  ${tty.dim("─".repeat(width - 4))}`, ""];
}

/** Print it, or nothing off a terminal. `theme` is the run's flag/env when the caller has
 *  parsed one; a subcommand that parses none reads the env itself. */
export function printMasthead(
  command: string,
  version: string,
  opts: { theme?: ThemeChoice; stream?: NodeJS.WriteStream; env?: NodeJS.ProcessEnv } = {},
): void {
  const stream = opts.stream ?? process.stderr;
  if (!stream.isTTY) return;
  const env = opts.env ?? process.env;
  const fromEnv = env.OPENMASQ_PROXY_THEME;
  const theme: ThemeChoice =
    opts.theme ??
    (fromEnv === "light" || fromEnv === "dark" || fromEnv === "auto" ? fromEnv : "auto");
  const tty = createTty(colorsWanted(env, stream.isTTY), () => stream.columns || 80, { theme });
  stream.write(`${mastheadRows(tty, command, version).join("\n")}\n`);
}
