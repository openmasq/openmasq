import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("./ipc/handle", () => ({ handle: vi.fn() }));
vi.mock("./fs/live", () => ({ getLiveFs: () => null }));

const { readSkillFile } = await import("./claudeSkills");

/**
 * The skills of a GRANTED repo are read by main and handed to the renderer: a SKILL.md there
 * must not lead outside the repo. `secret` stands for any file of the machine (a key, a token).
 */
let base: string;
let repo: string;
let secret: string;
beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "omq-skills-")));
  repo = join(base, "repo");
  secret = join(base, "id_rsa");
  await mkdir(join(repo, ".claude", "skills", "ok"), { recursive: true });
  await mkdir(join(repo, ".claude", "skills", "evil"), { recursive: true });
  await writeFile(join(repo, ".claude", "skills", "ok", "SKILL.md"), "# a skill");
  await writeFile(secret, "PRIVATE KEY");
});
afterEach(() => rm(base, { recursive: true, force: true }));

const posix = process.platform !== "win32";

describe("a repo's SKILL.md", () => {
  it("is read when it is a file of the repo", () => {
    expect(readSkillFile(join(repo, ".claude", "skills", "ok", "SKILL.md"), repo)).toBe("# a skill");
  });

  it.runIf(posix)("is refused when it is a link to a file outside the repo", async () => {
    const link = join(repo, ".claude", "skills", "evil", "SKILL.md");
    await symlink(secret, link);
    expect(readSkillFile(link, repo)).toBeNull();
  });

  it.runIf(posix)("is refused when the skills folder itself leads outside", async () => {
    await mkdir(join(base, "elsewhere", "x"), { recursive: true });
    await writeFile(join(base, "elsewhere", "x", "SKILL.md"), "outside");
    await rm(join(repo, ".claude", "skills"), { recursive: true });
    await symlink(join(base, "elsewhere"), join(repo, ".claude", "skills"));
    expect(readSkillFile(join(repo, ".claude", "skills", "x", "SKILL.md"), repo)).toBeNull();
  });

  it.runIf(posix)("in the user's own ~/.claude/skills, a linked skill is still read", async () => {
    const own = join(base, "home-skill.md");
    await writeFile(own, "# mine");
    const link = join(base, "SKILL.md");
    await symlink(own, link);
    expect(readSkillFile(link, null)).toBe("# mine");
  });

  it("an absent file is no skill", () => {
    expect(readSkillFile(join(repo, "nope", "SKILL.md"), repo)).toBeNull();
  });
});
