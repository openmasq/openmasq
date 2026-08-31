import { homedir } from "node:os";
import { join } from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { handle } from "./ipc/handle";
import { getLiveFs } from "./fs/live";

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

function scanRoot(root: string, from: RawSkill["from"], out: RawSkill[]): void {
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
    const file = join(root, folder, "SKILL.md");
    try {
      if (statSync(file).size > MAX_BYTES) continue;
      out.push({ folder, text: readFileSync(file, "utf8"), siblings: siblingNames(join(root, folder)), from });
    } catch {
      /* no SKILL.md in this subfolder: not a skill, skip it */
    }
  }
}

function listClaudeSkills(): RawSkill[] {
  const out: RawSkill[] = [];
  scanRoot(join(homedir(), ".claude", "skills"), "home", out);
  // The folders granted to the Files connector: that's where a repo's skills
  // live. Nothing is granted here — we re-read what was already granted.
  for (const root of getLiveFs()?.roots ?? []) {
    if (out.length >= MAX_SKILLS) break;
    scanRoot(join(root, ".claude", "skills"), "project", out);
  }
  return out;
}

export function registerClaudeSkillsIpc(): void {
  handle("claude-skills:list", [], () => listClaudeSkills());
}
