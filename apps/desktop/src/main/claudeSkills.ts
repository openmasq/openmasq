import { homedir } from "node:os";
import { join } from "node:path";
import { closeSync, constants, fstatSync, openSync, readdirSync, readSync } from "node:fs";
import { handle } from "./ipc/handle";
import { getLiveFs } from "./fs/live";
import { isWithin, realPathOrNull } from "./security/pathScope";

/**
 * "Import my Claude skills" — the ENUMERATION, on the privileged side.
 *
 * ⚠️ The renderer supplies NO path. This module enumerates roots it knows
 * itself and reads only a fixed-name file (`SKILL.md`): so this isn't the
 * widened read-gate (which grants a path only via the native dialog), it's a
 * single-shape ALLOW-listed capability (rule 7). A renderer XSS can call this
 * channel as much as it wants: it will get back the same SKILL.md files, never a chosen file.
 *
 * Two sources, no new right:
 *  1. `~/.claude/skills/` — Claude Code's personal skills.
 *  2. `<already-granted folder>/.claude/skills/` — those of a repo being worked on.
 *     These folders were already granted to the Files connector via the native dialog;
 *     none is claimed here, we re-read what the user already gave.
 *
 * ⛔ `~/.claude/plugins/**` is EXCLUDED: these are third-party plugin skills that
 * drive Claude Code's own tools — useless as prompts, and importing them would drown
 * the user's own under dozens of entries they didn't write.
 */

/** Bounds: a hostile folder must neither exhaust memory nor freeze enumeration. */
const MAX_SKILLS = 200;
const MAX_BYTES = 256 * 1024;
const MAX_SIBLINGS = 50;

interface RawSkill {
  folder: string;
  text: string;
  siblings: string[];
  /** Where it comes from — the import screen shows it to resolve the ambiguity between two
   *  same-named skills (personal vs. the repo's). */
  from: "home" | "project";
}

/** The folder's files other than SKILL.md — just their NAMES (never the content):
 *  they're used to say "this skill relies on N files that won't be imported". */
function siblingNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.name !== "SKILL.md" && !e.name.startsWith("."))
      .slice(0, MAX_SIBLINGS)
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  } catch {
    return [];
  }
}

/**
 * One SKILL.md, read through its open descriptor: a regular file only (never a pipe that would
 * hold the enumeration), at most {@link MAX_BYTES} however it grows meanwhile.
 * ⚠️ Under a GRANTED folder (`within`), the file must really live under that folder: a repo
 * can ship `SKILL.md` as a link to any file of the machine, and this channel would hand it to
 * the renderer. So its real path must stay under the folder's, and it is opened `O_NOFOLLOW`.
 * The user's own `~/.claude/skills` keeps its links (dotfile managers link skills in).
 */
export function readSkillFile(file: string, within: string | null): string | null {
  if (within) {
    const root = realPathOrNull(within);
    const real = realPathOrNull(file);
    if (!root || !real || !isWithin(root, real)) return null;
  }
  let fd: number | undefined;
  try {
    fd = openSync(file, constants.O_RDONLY | (within ? (constants.O_NOFOLLOW ?? 0) : 0) | (constants.O_NONBLOCK ?? 0));
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > MAX_BYTES) return null;
    const buf = Buffer.alloc(st.size);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function scanRoot(root: string, from: RawSkill["from"], out: RawSkill[], within: string | null = null): void {
  let entries: string[];
  try {
    entries = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return; // missing root: this source doesn't exist here, it's not an error
  }
  for (const folder of entries) {
    if (out.length >= MAX_SKILLS) return;
    const text = readSkillFile(join(root, folder, "SKILL.md"), within);
    // no readable SKILL.md in this subfolder: not a skill, skip it
    if (text !== null) out.push({ folder, text, siblings: siblingNames(join(root, folder)), from });
  }
}

function listClaudeSkills(): RawSkill[] {
  const out: RawSkill[] = [];
  scanRoot(join(homedir(), ".claude", "skills"), "home", out);
  // The folders granted to the Files connector: that's where a repo's skills
  // live. Nothing is granted here — we re-read what was already granted.
  for (const root of getLiveFs()?.roots ?? []) {
    if (out.length >= MAX_SKILLS) break;
    scanRoot(join(root, ".claude", "skills"), "project", out, root);
  }
  return out;
}

export function registerClaudeSkillsIpc(): void {
  handle("claude-skills:list", [], () => listClaudeSkills());
}
