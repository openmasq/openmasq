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

  /* Le trou que ceci ferme : la liste ne portait AUCUN chemin Windows (le commentaire disait
     « Windows-ish »), alors que `.ssh`/`.aws` y sont sous `%USERPROFILE%` et sont donc les
     SEULES entrées qui s'y appliquaient. Sur un build Windows, un `~` accordé rendait lisibles
     les cookies de tous les navigateurs, le Credential Manager, l'historique PowerShell — et
     `Microsoft\Protect`, les clés maîtresses DPAPI qui déchiffrent tout le reste, y compris
     les blobs safeStorage de l'app. Ces chemins n'ont pas d'équivalent relatif au home. */
  it("covers the WINDOWS credential stores that have no home-relative equivalent", () => {
    const roam = join(process.env.APPDATA || join(HOME, "AppData", "Roaming"));
    const local = join(process.env.LOCALAPPDATA || join(HOME, "AppData", "Local"));
    const dirs = ambientSecretDirs();
    // Les clés maîtresses DPAPI d'abord — les lire vaut tous les autres secrets réunis.
    expect(dirs).toContain(join(roam, "Microsoft", "Protect"));
    expect(dirs).toContain(join(roam, "Microsoft", "Crypto"));
    expect(dirs).toContain(join(roam, "Microsoft", "Credentials"));
    // Les profils de navigateurs, là où Windows les range vraiment.
    expect(dirs).toContain(join(local, "Google", "Chrome", "User Data"));
    expect(dirs).toContain(join(local, "Microsoft", "Edge", "User Data"));
    expect(dirs).toContain(join(roam, "Mozilla", "Firefox"));
    // Les stores CLI qui n'utilisent pas la disposition XDG sur Windows.
    expect(dirs).toContain(join(roam, "gcloud"));
    // L'équivalent Windows de `.bash_history`.
    expect(ambientSecretFiles()).toContain(
      join(roam, "Microsoft", "Windows", "PowerShell", "PSReadLine", "ConsoleHost_history.txt"),
    );
  });

  it("Windows reuses the home-relative entries for .ssh/.aws (%USERPROFILE% IS home)", () => {
    // Pourquoi le bloc Windows n'a pas à les redire : sur Windows `app.getPath("home")`
    // vaut `%USERPROFILE%`, donc `h(".ssh")` désigne déjà `C:\Users\x\.ssh`. Les redoubler
    // créerait la deuxième liste que la règle 9 interdit.
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
    // Les racines Windows sont épinglées SOUS le home temporaire, donc ce test vaut aussi
    // bien sur un runner macOS que sur un runner Windows — la disposition testée est la
    // vraie (`AppData\Roaming` / `AppData\Local`), seul l'ancrage est déterministe.
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
