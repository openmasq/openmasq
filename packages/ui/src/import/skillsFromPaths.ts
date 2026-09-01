import type { RawSkillFile } from "./claudeSkills";

/** A file as a drop (folder, selection, zip) rendered it: a path RELATIVE to the drop
 *  point, and its text. */
export interface DroppedFile {
  path: string;
  text: string;
}

const dirOf = (p: string): string => p.slice(0, Math.max(0, p.lastIndexOf("/")));
const baseOf = (p: string): string => p.slice(p.lastIndexOf("/") + 1);

/**
 * What a DROP contains as skills — the rule, pure.
 *
 * **Two shapes make a skill, and only two:**
 *  1. a folder that contains a `SKILL.md` (the Claude shape); the folder names it, its
 *     other files become its « annexes »;
 *  2. a `.md` dropped AT THE ROOT of the selection — THIS file was dropped, so it is the
 *     object of the gesture.
 *
 * ⚠️ **A buried `.md` does not count.** Dropping `~/.claude/skills` brings back whole
 * documentation folders (`_lifecycles/` contains ten): taking them for skills would
 * manufacture ten nobody wrote. A `readme.md` sitting next to a `SKILL.md` is an annex,
 * never a skill — the same rule seen from the other side.
 */
export function skillsFromPaths(files: readonly DroppedFile[]): RawSkillFile[] {
  const norm = files
    .map((f) => ({ ...f, path: f.path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "") }))
    .filter((f) => f.path && !baseOf(f.path).startsWith("."));

  // The folders carrying a SKILL.md, and everything they contain.
  const byDir = new Map<string, DroppedFile[]>();
  for (const f of norm) {
    const d = dirOf(f.path);
    const list = byDir.get(d);
    if (list) list.push(f);
    else byDir.set(d, [f]);
  }

  const out: RawSkillFile[] = [];
  const claimed = new Set<string>();
  for (const [dir, list] of byDir) {
    const skill = list.find((f) => baseOf(f.path).toLowerCase() === "skill.md");
    if (!skill) continue;
    for (const f of list) claimed.add(f.path);
    out.push({
      // A SKILL.md dropped ALONE has no parent folder: its own name will do.
      folder: baseOf(dir) || "skill",
      text: skill.text,
      siblings: list.filter((f) => f !== skill).map((f) => baseOf(f.path)),
    });
  }

  // The `.md` files dropped at the root: it is the file itself that was let go.
  for (const f of norm) {
    if (claimed.has(f.path) || dirOf(f.path)) continue;
    if (!/\.md$/i.test(f.path)) continue;
    out.push({ folder: baseOf(f.path).replace(/\.md$/i, ""), text: f.text, siblings: [] });
  }
  return out;
}
