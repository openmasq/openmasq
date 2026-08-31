import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A REAL temp home so the fs-grant block can be exercised end-to-end (grant realpaths its
// roots/deny). userData is a sibling temp dir. Created before the (hoisted) mock reads them.
const HOME = realpathSync(mkdtempSync(join(tmpdir(), "openmasq-home-")));
const USERDATA = realpathSync(mkdtempSync(join(tmpdir(), "openmasq-ud-")));
vi.mock("electron", () => ({
  app: { getPath: (k: string) => (k === "home" ? HOME : USERDATA) },
}));

import {
  ambientSecretDirs,
  ambientSecretFiles,
  ambientSecretPaths,
  fsMcpDenyPaths,
} from "./ambientSecrets";
import { makeGrant } from "../fs/grant";

/* The user's AMBIENT credential deny set is the SINGLE SOURCE both the Python jail
   (`python/sandbox.ts` secretPaths) and the Filesystem MCP tool deny-list (`fsMcpDenyPaths`,
   wired in `mcp/server/connect.ts`) consume. Before this, fsDenyPaths returned ONLY userData,
   so a granted broad root (~) let a model `read_file("~/.ssh/id_rsa")` exfiltrate the key. */
describe("ambient credential deny set", () => {
  it("covers cloud/CLI/dev credential DIRS", () => {
    const dirs = ambientSecretDirs();
    for (const p of [".ssh", ".aws", ".gnupg", ".kube", ".docker"]) {
      expect(dirs).toContain(join(HOME, p));
    }
    expect(dirs).toContain(join(HOME, ".config", "gcloud"));
    expect(dirs).toContain(join(HOME, "Library", "Keychains"));
  });

  it("covers credential FILES (dotfiles + shell histories)", () => {
    const files = ambientSecretFiles();
    for (const f of [".netrc", ".git-credentials", ".pgpass", ".zsh_history"]) {
      expect(files).toContain(join(HOME, f));
    }
  });

  /* The hole this closes: the list carried NO Windows path at all (the comment said
     « Windows-ish »), while `.ssh`/`.aws` sit under `%USERPROFILE%` there and were thus the
     ONLY entries that applied. On a Windows build, a granted `~` made readable
     every browser's cookies, the Credential Manager, the PowerShell history — and
     `Microsoft\Protect`, the DPAPI master keys that decrypt everything else, including
     the app's own safeStorage blobs. These paths have no home-relative equivalent. */
  it("covers the WINDOWS credential stores that have no home-relative equivalent", () => {
    const roam = join(process.env.APPDATA || join(HOME, "AppData", "Roaming"));
    const local = join(process.env.LOCALAPPDATA || join(HOME, "AppData", "Local"));
    const dirs = ambientSecretDirs();
    // The DPAPI master keys first — reading them is worth all the other secrets combined.
    expect(dirs).toContain(join(roam, "Microsoft", "Protect"));
    expect(dirs).toContain(join(roam, "Microsoft", "Crypto"));
    expect(dirs).toContain(join(roam, "Microsoft", "Credentials"));
    // Browser profiles, where Windows actually stores them.
    expect(dirs).toContain(join(local, "Google", "Chrome", "User Data"));
    expect(dirs).toContain(join(local, "Microsoft", "Edge", "User Data"));
    expect(dirs).toContain(join(roam, "Mozilla", "Firefox"));
    // The CLI stores that don't use the XDG layout on Windows.
    expect(dirs).toContain(join(roam, "gcloud"));
    // The Windows equivalent of `.bash_history`.
    expect(ambientSecretFiles()).toContain(
      join(roam, "Microsoft", "Windows", "PowerShell", "PSReadLine", "ConsoleHost_history.txt"),
    );
  });

  it("Windows reuses the home-relative entries for .ssh/.aws (%USERPROFILE% IS home)", () => {
    // Why the Windows block doesn't need to repeat them: on Windows `app.getPath("home")`
    // equals `%USERPROFILE%`, so `h(".ssh")` already designates `C:\Users\x\.ssh`. Duplicating them
    // would create the second list rule 9 forbids.
    expect(ambientSecretDirs()).toContain(join(HOME, ".ssh"));
    expect(ambientSecretDirs()).toContain(join(HOME, ".aws"));
  });

  it("the flat list is dirs ∪ files and excludes userData (each caller adds its own)", () => {
    const flat = ambientSecretPaths();
    expect(flat).toEqual([...ambientSecretDirs(), ...ambientSecretFiles()]);
    expect(flat).not.toContain(USERDATA);
  });
});

describe("fs-MCP deny-list (fsMcpDenyPaths) — the closed exfil hole", () => {
  beforeAll(() => {
    mkdirSync(join(HOME, ".ssh"), { recursive: true });
    writeFileSync(join(HOME, ".ssh", "id_rsa"), "PRIVATE KEY");
    writeFileSync(join(HOME, ".netrc"), "machine x login y password z");
    writeFileSync(join(HOME, "notes.txt"), "harmless");
  });
  afterAll(() => {
    rmSync(HOME, { recursive: true, force: true });
    rmSync(USERDATA, { recursive: true, force: true });
  });

  it("includes userData AND the whole ambient credential set (audit HIGH)", () => {
    const deny = fsMcpDenyPaths();
    expect(deny).toContain(USERDATA);
    for (const p of ambientSecretPaths()) expect(deny).toContain(p);
  });

  it("a grant over HOME BLOCKS the Windows DPAPI master keys and a browser cookie jar", () => {
    // The Windows roots are pinned UNDER the temp home, so this test holds just as
    // well on a macOS runner as on a Windows runner — the layout under test is the
    // real one (`AppData\Roaming` / `AppData\Local`), only the anchor is deterministic.
    vi.stubEnv("APPDATA", join(HOME, "AppData", "Roaming"));
    vi.stubEnv("LOCALAPPDATA", join(HOME, "AppData", "Local"));
    const dpapi = join(HOME, "AppData", "Roaming", "Microsoft", "Protect");
    const chrome = join(HOME, "AppData", "Local", "Google", "Chrome", "User Data");
    mkdirSync(dpapi, { recursive: true });
    mkdirSync(chrome, { recursive: true });
    writeFileSync(join(dpapi, "masterkey"), "DPAPI");
    writeFileSync(join(chrome, "Cookies"), "COOKIES");

    const g = makeGrant([HOME], fsMcpDenyPaths());
    expect(() => g.resolve(join(dpapi, "masterkey"))).toThrow(/protégé|refusé/);
    expect(() => g.resolve(join(chrome, "Cookies"))).toThrow(/protégé|refusé/);
    vi.unstubAllEnvs();
  });

  it("a grant over the HOME dir BLOCKS ~/.ssh/id_rsa and ~/.netrc, but allows a sibling file", () => {
    // Exactly how LocalFsConnection wires it: makeGrant([root], fsMcpDenyPaths()).
    const g = makeGrant([HOME], fsMcpDenyPaths());
    expect(() => g.resolve(join(HOME, ".ssh", "id_rsa"))).toThrow(/protégé|refusé/);
    expect(() => g.resolve(join(HOME, ".netrc"))).toThrow(/protégé|refusé/);
    // A non-credential file under the same grant still resolves — no over-blocking.
    expect(g.resolve(join(HOME, "notes.txt"))).toBe(join(HOME, "notes.txt"));
  });
});
