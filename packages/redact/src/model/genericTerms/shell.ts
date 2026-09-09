/**
 * The CONTEXT-scoped half of the shell allow-list (`../vocab/shell.ts` holds the list and
 * says why it is split in two): a command name that, standing alone, is also somebody's
 * initials (`ls`, `cp`, `mv`) or somebody's name (`ping`, `wall`, `black`, `ruby`).
 *
 * A flat entry outranks every category, so these are spared ONLY where the text itself
 * proves a command line. Everything here is therefore written as a PROOF, and the absence
 * of proof is a redaction: the gate fails CLOSED, like every other one in this package.
 *
 * Two proofs, and nothing else counts:
 *  1. a shell INTRODUCER right before the word — a pipe, `;`, `&&`, `$(`, a backtick, or
 *     one of the words that can only be followed by a command (`sudo`, `xargs`, `nohup`…);
 *  2. the word at the HEAD of its line, with the rest of that line carrying an argument
 *     only a command takes — a `-x`/`--long` flag, a path, a redirection or a pipe.
 *
 * And a third condition over both: the candidate is spelled EXACTLY as it must be typed,
 * i.e. lowercase. « Ruby » at the head of a line is a person; `ruby scripts/seed.rb` is
 * the interpreter. `applyVault` being case-sensitive, that single test separates them for
 * good — the person keeps her fake, the command keeps its name.
 */
import { SHELL_CONTEXT_TERMS } from "../vocab";

const SHELL_CONTEXT = new Set(SHELL_CONTEXT_TERMS);

/** A word that can only introduce another command (`sudo ls`, `xargs rm`, `time make`). */
const COMMAND_PREFIX =
  "sudo|doas|xargs|nohup|time|env|exec|command|builtin|watch|then|else|do|and|or|not";

/** What may sit just before the word: a pipeline/list operator, a substitution opening,
 *  or one of the prefixes above. Start of LINE is deliberately NOT here — on its own it
 *  proves nothing (« ls of the attendees » opens a line too), so it goes through
 *  `LINE_HEAD` + the argument evidence below instead. */
const INTRODUCER = new RegExp(
  String.raw`(?:[;&|(\x60]|\$\(|(?:^|[\s;&|(])(?:${COMMAND_PREFIX})\s)[ \t]*$`,
  "u",
);

/** Start of the line, allowing a prompt, a quote/bullet marker and indentation. */
const LINE_HEAD = /(?:^|\n)[ \t]*(?:[>*-]\s*)?(?:[$#%]\s+)?$/u;

/** …then the rest of that line must carry what only a command takes: a `-x`/`--long`
 *  flag, a path, a quoted/expanded argument, a file with an extension, a redirection or
 *  a pipe. Ordinary prose carries none of them (« ls of the attendees » stays a
 *  candidate), which is the whole point. */
const ARGUMENT =
  /(?:^|[ \t])(?:-{1,2}[A-Za-z0-9]|["'$(]|[.~]{0,2}\/|[\w.@~-]*\/[\w.@~-]|[\w@~-]+\.[A-Za-z0-9]{1,8}(?:[ \t]|$)|\||>>?|<|&&)/u;

/** The word may only be followed by a shell boundary — never by another letter/digit. */
const BOUNDARY = /^(?:[ \t]|$|[\n;&|)\x60'"<>])/u;

/**
 * True when `value` is one of the context-scoped commands AND `input` shows it running as
 * one. `input` absent ⇒ false: a caller with no text has no proof, and no proof means the
 * value stays a candidate.
 */
export function isShellCommandOccurrence(value: string, input?: string): boolean {
  if (!input) return false;
  const cmd = value.trim();
  // Lowercase as typed, or it is not the command (see the header).
  if (cmd !== cmd.toLowerCase() || !SHELL_CONTEXT.has(cmd)) return false;
  for (let at = input.indexOf(cmd); at !== -1; at = input.indexOf(cmd, at + 1)) {
    const before = input.slice(0, at);
    const after = input.slice(at + cmd.length);
    // A letter/digit on either side means this is a fragment of another word.
    if (/[\p{L}\p{N}_-]$/u.test(before) || !BOUNDARY.test(after)) continue;
    if (INTRODUCER.test(before)) return true;
    if (!LINE_HEAD.test(before)) continue;
    // An argument needs a separator: `ls` alone at the head of a line proves nothing.
    const line = after.split("\n", 1)[0];
    if (/^[ \t]/u.test(line) && ARGUMENT.test(line)) return true;
  }
  return false;
}
