import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeGrant } from "./grant";

// Real temp layout:
//   root/            <- the GRANTED directory
//     ok.txt
//     sub/
//     escape         -> symlink to <outside>          (inside grant, points OUT)
//   outside/
//     secret.txt
//   deny/            <- a DENIED subtree (e.g. userData)
//     keys.enc
let base: string, root: string, outside: string, deny: string;

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "fsgrant-")));
  root = join(base, "root");
  outside = join(base, "outside");
  deny = join(base, "deny");
  mkdirSync(join(root, "sub"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  mkdirSync(deny, { recursive: true });
  writeFileSync(join(root, "ok.txt"), "ok");
  writeFileSync(join(outside, "secret.txt"), "secret");
  writeFileSync(join(deny, "keys.enc"), "cipher");
  symlinkSync(outside, join(root, "escape")); // a symlink inside the grant → out
});
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("filesystem grant gate", () => {
  it("allows a real path inside the granted root", () => {
    const g = makeGrant([root]);
    expect(g.resolve(join(root, "ok.txt"))).toBe(join(root, "ok.txt"));
    expect(g.resolve(join(root, "sub"))).toBe(join(root, "sub"));
  });

  it("blocks ../ traversal out of the grant", () => {
    const g = makeGrant([root]);
    expect(() => g.resolve(join(root, "..", "outside", "secret.txt"))).toThrow(/refusé|autoris/);
  });

  it("blocks a symlink INSIDE the grant that points OUT (read)", () => {
    const g = makeGrant([root]);
    // root/escape → outside ; reading root/escape/secret.txt must resolve to outside/… → denied
    expect(() => g.resolve(join(root, "escape", "secret.txt"))).toThrow(/autoris|refusé/);
  });

  it("blocks a WRITE whose parent escapes via a symlink", () => {
    const g = makeGrant([root]);
    // root/escape/new.txt doesn't exist; nearest existing ancestor is root/escape → outside → denied
    expect(() => g.resolve(join(root, "escape", "new.txt"))).toThrow(/autoris|refusé/);
  });

  it("allows a not-yet-existing file inside the grant (write/create)", () => {
    const g = makeGrant([root]);
    expect(g.resolve(join(root, "sub", "new.txt"))).toBe(join(realpathSync(root), "sub", "new.txt"));
  });

  it("rejects an embedded .. segment in a not-yet-existing path", () => {
    const g = makeGrant([root]);
    // nearest existing = root/sub ; trailing "../../outside" contains .. → refused
    expect(() => g.resolve(join(root, "sub", "..", "..", "outside", "x"))).toThrow();
  });

  it("blocks anything under a DENIED subtree even if inside a grant", () => {
    // Grant the whole base but deny `deny/` — keys.enc must be refused.
    const g = makeGrant([base], [deny]);
    expect(g.resolve(join(base, "root", "ok.txt"))).toBeTruthy();
    expect(() => g.resolve(join(deny, "keys.enc"))).toThrow(/protégé|refusé/);
  });

  it("denies a secret that does NOT exist yet at grant-creation time", () => {
    // A deny path absent from disk must NOT be dropped — it has to protect the file the
    // moment it's created (a secret written after the grant was made).
    const ghost = join(base, "secrets-not-created-yet");
    const g = makeGrant([base], [ghost]);
    // Create it AFTER the grant, then try to reach a file inside it.
    mkdirSync(ghost, { recursive: true });
    writeFileSync(join(ghost, "keys.enc"), "cipher");
    expect(() => g.resolve(join(ghost, "keys.enc"))).toThrow(/protégé|refusé/);
  });

  it("rejects a non-absolute path and a NUL byte", () => {
    const g = makeGrant([root]);
    expect(() => g.resolve("relative/path")).toThrow(/absolu/);
    expect(() => g.resolve(join(root, "a\0b"))).toThrow(/invalide/);
  });

  it("compares by path segment, not raw prefix (/a/bc not under /a/b)", () => {
    const sib = join(base, "rootsibling");
    mkdirSync(sib, { recursive: true });
    writeFileSync(join(sib, "x.txt"), "x");
    const g = makeGrant([root]); // grant is base/root, sibling is base/rootsibling
    expect(() => g.resolve(join(sib, "x.txt"))).toThrow(/autoris|refusé/);
  });

  it("resolves a granted root that is itself a symlink", () => {
    const linkRoot = join(base, "linkroot");
    symlinkSync(root, linkRoot); // grant given as a symlink → its real target is root
    const g = makeGrant([linkRoot]);
    expect(g.resolve(join(linkRoot, "ok.txt"))).toBe(join(realpathSync(root), "ok.txt"));
  });
});

describe("le refus ORIENTE le modèle (constat agentique 15/08)", () => {
  // Le modèle ne peut pas recopier un chemin autorisé — les résultats lui reviennent
  // redacted segment par segment — donc il remonte vers un ancêtre (`~/Desktop`, puis
  // `~`), se fait refuser trois fois, et la boucle annonce « aucun résultat » sur des
  // dossiers pleins. Le refus doit donc dire OÙ chercher, et comment ne pas deviner.
  it("nomme les racines autorisées et dit d'omettre « path »", () => {
    const g = makeGrant([root]);
    const dehors = join(base, "ailleurs.txt");
    let msg = "";
    try {
      g.resolve(dehors);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("hors des dossiers autorisés");
    // …la racine réelle, telle que `list_allowed_directories` la rend déjà au même modèle
    expect(msg).toContain(realpathSync(root));
    // …et la sortie : ne pas inventer, omettre `path`
    expect(msg).toMatch(/omets/i);
    expect(msg).toMatch(/n'invente pas/i);
  });

  it("le refus d'un chemin PROTÉGÉ reste sec — là, il n'y a rien à proposer", () => {
    const denied = join(root, "secrets");
    mkdirSync(denied, { recursive: true });
    writeFileSync(join(denied, "k.txt"), "x");
    const g = makeGrant([root], [denied]);
    let msg = "";
    try {
      g.resolve(join(denied, "k.txt"));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain("chemin protégé");
    expect(msg).not.toMatch(/omets/i); // ne jamais inviter à contourner une interdiction
  });
});
