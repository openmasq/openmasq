/**
 * ⚠️ **NOT folded into `VOCAB_TERMS`, and that is the whole point.** Each of these is a
 * real command whose NAME, standing alone, is something else too: a person's initials
 * (`ls`, `cp`, `mv`), a given name (`ping`, `cal`, `joe`, `hugo`, `sam`), a surname
 * (`black`, `wall`, `packer`).
 * A flat entry outranks every category, so sparing them there would ship a real name in
 * clear the day someone writes it.
 *
 * They are spared by `../genericTerms/shell.ts` `isShellCommandOccurrence` ONLY where the
 * text itself proves a command line — after a pipe/`;`/`&&`/`$(`, after `sudo`/`xargs`,
 * or at the head of a line that carries a flag, a path or a redirection. No proof ⇒ the
 * value stays a candidate: the gate fails CLOSED, like every other one in this package.
 */
export const SHELL_CONTEXT_TERMS: string[] = [
  // 1-2 characters — the bulk of a real command line
  "ls", "cd", "rm", "cp", "mv", "ln", "dd", "df", "du", "ps", "wc", "tr", "id", "su",
  "bc", "dc", "at", "ip", "ss", "nc", "vi", "ed", "ex", "fc", "fg", "bg", "ar", "ld",
  "nm", "go", "jq", "yq", "rg", "fd", "sd", "pr", "nl", "od", "w", "sh",
  "pv", "ag", "xz", "hx", "mc", "oc", "az", "bq", "gh", "hg", "wg", "cc", "as", "gs",
  "ts", "sv", "iw", "xh", "ab", "ng", "nx", "m4", "7z", "k6",
  "jj", "p4", "st", "lf", "gm", "vd", "bb", "c8", "py", "r2", "wp", "sq", "jo", "fx",
  // …and the command names that are also somebody's name. NOT here: `swift` — the
  // banking-label entry in `../genericTerms/data.ts` already spares it flat, a call made
  // on a stronger case (a bare « SWIFT: » line in a bank letter) than the compiler's name.
  "ping", "cal", "wall", "finger", "black", "pico", "joe", "delta", "dust",
  "ruby", "julia", "crystal", "nim", "zig", "fish", "dash", "ash",
  "hugo", "ant", "lex", "zed", "salt", "packer", "borg", "miller", "mate",
  "axel", "aws", "octave",
  "ivy", "ray", "luigi", "ava", "stern", "lima", "bacon", "mason", "gatsby", "task",
  "daphne", "just", "yara",
];
