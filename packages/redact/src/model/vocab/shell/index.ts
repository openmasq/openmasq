/**
 * GENERIC_TERMS, the **shell** volume: the names of the commands a terminal runs —
 * builtins, coreutils, the classic UNIX tools, the daemons and the everyday developer
 * CLIs (toolchains, package managers, containers, cloud, databases, media).
 *
 * Why a volume of its own, and why it is not optional: the product sits next to an AGENT
 * that WRITES shell commands, and a conversation about a machine is made of these words.
 * A detector tags one as an ORG or a NAME (`echo`, `Curl`, `AWK` in a header are exactly
 * the shape a NER reads as a proper noun), the allocator gives it a fake — and from that
 * moment `applyVault` rewrites the word in EVERY later turn of the conversation, inside
 * the command line the agent is about to run. The command becomes another command, or
 * nothing at all. Not one byte of anybody's data was protected on the way.
 * It is the third door onto the incident `engine/vault/pathSegments.ts` closed for a path
 * SEGMENT (a project folder named `echo`); this one is the DETECTION side of it.
 *
 * ⚠️ Same allow-list discipline as every other volume (`./index.ts` carries it in full) —
 * an entry ships that word in clear FOREVER. Two things follow, and they are what splits
 * this file in two lists:
 *
 * 1. **A command name that is ALSO a person's name never goes in the flat list.** It goes
 *    in `SHELL_CONTEXT_TERMS` below, spared only where it can ONLY be a command.
 *    Deliberately ABSENT from the flat list: `ping` (a Chinese given name — the mechanical
 *    guard in `../vocabGuards.test.ts` catches it), `black`, `wall`, `finger`, `cal`,
 *    `pico`, `joe`, `ruby`, `swift`, `rust`, `julia`, `ada`, `hugo`, `axel`, `aws`,
 *    `octave`, `daphne`, `yara`, `just`, `ant`, `lex`, `zed`, `salt`, `packer`, `borg`,
 *    `miller`, `ivy`, `ray`, `ava`, `mason` — every one of them a real first name or
 *    surname, spelled identically.
 * 2. **No bare 1-2 char entry** (`ls`, `cd`, `rm`, `jq`…): the match is on the WHOLE
 *    value, separators folded, so `ls` would spare the initials « L.S. ». Those are the
 *    other half of `SHELL_CONTEXT_TERMS` — a digit buys no exemption (`7z`, `k6`, `m4`,
 *    `nx` go there too).
 *
 * The volume is SPLIT BY FAMILY across this folder — `unix.ts` (the shell itself, files,
 * text, archives), `system.ts` (network, daemons, processes, accounts, packages, Windows),
 * `dev.ts` (version control, build, the language ecosystems, containers, cloud, databases,
 * scanners), `desktop.ts` (editors, the desktop session, media, documents) and `context.ts`
 * (the scoped half below). One flat Set all the same: the split is for the READER, who has
 * to be able to tell whether a command is already covered before adding it.
 *
 * Overlap with the technical volume (`git`, `docker`, `npm`, `ssh`…) is deliberate and
 * free: the consumer is ONE flat Set. This file's job is to be the LIST OF COMMANDS,
 * readable as such, not a set of leftovers — so a tool already spared as a technology
 * (`node`, `terraform`, `helm`) is listed here too, under the family it is TYPED in.
 */

import { UNIX_COMMANDS } from "./unix";
import { SYSTEM_COMMANDS } from "./system";
import { DEV_COMMANDS } from "./dev";
import { DESKTOP_COMMANDS } from "./desktop";

export { SHELL_CONTEXT_TERMS } from "./context";

/** Commands safe as a bare value — no 1-2 char token, no homograph of a name. */
export const SHELL_TERMS: string[] = [
  ...UNIX_COMMANDS,
  ...SYSTEM_COMMANDS,
  ...DEV_COMMANDS,
  ...DESKTOP_COMMANDS,
];
