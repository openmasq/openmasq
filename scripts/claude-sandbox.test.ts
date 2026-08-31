import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform, tmpdir } from "node:os";

// The seatbelt profile of `pnpm claude:sandbox`. The trap that cost a whole session:
// a `deny file-read* (subpath "/Users")` makes unreachable what it ALLOWS elsewhere,
// because realpath(3) — which Node applies to every entry point — lstats EACH component of
// the path. The symptom comes out as `EPERM … lstat '/Users'` on a file that IS in the
// repository, and reads like a broken tool. Hence these tests: they judge the profile that is
// REALLY printed (`--print-profile` is what the launch applies), not a copy of its rules.
// macOS only — which is already true of the script itself.

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "claude-sandbox.sh");
const PROJECT = dirname(HERE);
const HOME = homedir();

const printProfile = (env: NodeJS.ProcessEnv = {}) =>
  execFileSync("bash", [SCRIPT, "--print-profile"], { encoding: "utf8", env: { ...process.env, ...env } });

/** The ANCESTOR folders of a path, under /Users only (above it, nothing is denied). */
const ancestorsOf = (p: string): string[] => {
  const out: string[] = [];
  for (let d = dirname(p); d.startsWith("/Users"); d = dirname(d)) out.push(d);
  return out;
};

const MAC = platform() === "darwin";

describe.skipIf(!MAC)("claude-sandbox — le profil seatbelt", () => {
  const profile = join(mkdtempSync(join(tmpdir(), "openmasq-sb-")), "profil.sb");
  // ⚠️ `describe.skipIf` only skips the TESTS: the `describe` body is evaluated at
  // COLLECTION time, no matter what. Without this condition, `--print-profile` used to run on the
  // CI's Linux runner — where the script refuses to run (seatbelt, `sandbox-exec` and the
  // `claude` binary are macOS facts) — and the suite FAILED at collection instead of being
  // skipped: the whole CI red, for a test that was not meant to apply there.
  if (MAC) writeFileSync(profile, printProfile());

  const run = (argv: string[]) => spawnSync("sandbox-exec", ["-f", profile, ...argv], { encoding: "utf8" });
  const permis = (argv: string[]) => run(argv).status === 0;

  it("lets Node resolve a file FROM THE REPOSITORY — the case that blocked everything", () => {
    // realpath lstats EACH ancestor of the path (/Users, then each folder) before reaching
    // the allowed file.
    // Without the ancestors' metadata: EPERM, and with it the driver, vitest, tsc, the
    // check:* gates and the pre-commit hook — everything that enters through a PATH
    // rather than -e.
    const r = run([process.execPath, "-e", `require("fs").realpathSync(${JSON.stringify(join(PROJECT, "package.json"))})`]);
    expect(r.stderr).not.toMatch(/EPERM|not permitted/);
    expect(r.status).toBe(0);
  });

  it("makes every ancestor of the repository stat-able", () => {
    for (const p of ancestorsOf(PROJECT)) expect([p, permis(["/usr/bin/stat", "-f", "%N", p])]).toEqual([p, true]);
  });

  it("opens ONLY the metadata: an ancestor's content stays unreadable", () => {
    // The nuance that makes the fix acceptable: `stat` on an already-known path passes,
    // but listing an ancestor — hence discovering a neighbour's NAME — stays denied.
    expect(permis(["/bin/ls", "/Users"])).toBe(false);
    expect(permis(["/bin/ls", join(HOME, "Desktop")])).toBe(false);
  });

  it("leaves the secrets denied, metadata included", () => {
    for (const secret of [".ssh", ".aws", ".gnupg"]) {
      const p = join(HOME, secret);
      expect([p, permis(["/usr/bin/stat", "-f", "%N", p])]).toEqual([p, false]);
    }
  });

  it("opens exactly the ancestors of the allowed paths, and no leaf", () => {
    const text = printProfile();
    const metadonnees = [...text.matchAll(/\(allow file-read-metadata \(literal "([^"]+)"\)\)/g)].map((m) => m[1]);
    const autorises = text
      .split("\n")
      .filter((l) => !l.includes("file-read-metadata"))
      .flatMap((l) => [...l.matchAll(/\((?:subpath|literal) "(\/Users\/[^"]*)"\)/g)].map((m) => m[1]));
    expect(new Set(metadonnees)).toEqual(new Set(autorises.flatMap(ancestorsOf)));
  });

  it("derives that list from the profile, instead of copying it", () => {
    // The anti-drift guarantee: widening an allow-list opens ITS ancestors on its own.
    // Without that, the next path added would replay the same EPERM.
    const inedit = join(HOME, "Documents", "openmasq-dossier-inexistant");
    const text = printProfile({ CLAUDE_SANDBOX_READ: inedit });
    expect(text).toContain(`(allow file-read-metadata (literal "${join(HOME, "Documents")}"))`);
  });
});
