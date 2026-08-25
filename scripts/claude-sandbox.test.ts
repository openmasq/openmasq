import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform, tmpdir } from "node:os";

// Le profil seatbelt de `pnpm claude:sandbox`. Le piège qu'il a coûté une session entière :
// un `deny file-read* (subpath "/Users")` rend inatteignable ce qu'il AUTORISE par ailleurs,
// parce que realpath(3) — que Node applique à tout point d'entrée — lstat CHAQUE composant du
// chemin. Le symptôme sort en `EPERM … lstat '/Users'` sur un fichier pourtant dans le dépôt,
// et se lit comme une panne de l'outil. D'où ces tests : ils jugent le profil RÉELLEMENT
// imprimé (`--print-profile` est ce que le lancement applique), pas une copie de ses règles.
// macOS uniquement — c'est déjà le cas du script lui-même.

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "claude-sandbox.sh");
const PROJECT = dirname(HERE);
const HOME = homedir();

const printProfile = (env: NodeJS.ProcessEnv = {}) =>
  execFileSync("bash", [SCRIPT, "--print-profile"], { encoding: "utf8", env: { ...process.env, ...env } });

/** Les dossiers ANCÊTRES d'un chemin, sous /Users seulement (au-dessus, rien n'est refusé). */
const ancestorsOf = (p: string): string[] => {
  const out: string[] = [];
  for (let d = dirname(p); d.startsWith("/Users"); d = dirname(d)) out.push(d);
  return out;
};

const MAC = platform() === "darwin";

describe.skipIf(!MAC)("claude-sandbox — le profil seatbelt", () => {
  const profile = join(mkdtempSync(join(tmpdir(), "openmasq-sb-")), "profil.sb");
  // ⚠️ `describe.skipIf` ne saute que les TESTS : le corps du `describe` est évalué à la
  // COLLECTE, quoi qu'il arrive. Sans cette condition, `--print-profile` partait sur le
  // runner Linux de la CI — où le script refuse de tourner (seatbelt, `sandbox-exec` et le
  // binaire `claude` sont des faits macOS) — et la suite ÉCHOUAIT à la collecte au lieu
  // d'être sautée : toute la CI rouge, pour un test censé ne pas s'appliquer là (15/08).
  if (MAC) writeFileSync(profile, printProfile());

  const run = (argv: string[]) => spawnSync("sandbox-exec", ["-f", profile, ...argv], { encoding: "utf8" });
  const permis = (argv: string[]) => run(argv).status === 0;

  it("laisse Node résoudre un fichier DU DÉPÔT — le cas qui bloquait tout", () => {
    // realpath lstat /Users, Desktop, info, ATELIER… avant d'arriver au fichier autorisé.
    // Sans les métadonnées des ancêtres : EPERM, et avec lui le pilote, vitest, tsc,
    // les check:* et le hook pre-commit — tout ce qui entre par un CHEMIN plutôt que -e.
    const r = run([process.execPath, "-e", `require("fs").realpathSync(${JSON.stringify(join(PROJECT, "package.json"))})`]);
    expect(r.stderr).not.toMatch(/EPERM|not permitted/);
    expect(r.status).toBe(0);
  });

  it("rend stat-able chaque ancêtre du dépôt", () => {
    for (const p of ancestorsOf(PROJECT)) expect([p, permis(["/usr/bin/stat", "-f", "%N", p])]).toEqual([p, true]);
  });

  it("n'ouvre QUE les métadonnées : le contenu d'un ancêtre reste illisible", () => {
    // La nuance qui rend le correctif acceptable : `stat` d'un chemin déjà connu passe,
    // mais lister un ancêtre — donc découvrir le NOM d'un voisin — reste refusé.
    expect(permis(["/bin/ls", "/Users"])).toBe(false);
    expect(permis(["/bin/ls", join(HOME, "Desktop")])).toBe(false);
  });

  it("laisse les secrets refusés, métadonnées comprises", () => {
    for (const secret of [".ssh", ".aws", ".gnupg"]) {
      const p = join(HOME, secret);
      expect([p, permis(["/usr/bin/stat", "-f", "%N", p])]).toEqual([p, false]);
    }
  });

  it("ouvre exactement les ancêtres des chemins autorisés, et aucune feuille", () => {
    const text = printProfile();
    const metadonnees = [...text.matchAll(/\(allow file-read-metadata \(literal "([^"]+)"\)\)/g)].map((m) => m[1]);
    const autorises = text
      .split("\n")
      .filter((l) => !l.includes("file-read-metadata"))
      .flatMap((l) => [...l.matchAll(/\((?:subpath|literal) "(\/Users\/[^"]*)"\)/g)].map((m) => m[1]));
    expect(new Set(metadonnees)).toEqual(new Set(autorises.flatMap(ancestorsOf)));
  });

  it("dérive cette liste du profil, au lieu de la recopier", () => {
    // La garantie anti-dérive : élargir une liste d'autorisation ouvre SES ancêtres tout
    // seul. Sans ça, le prochain chemin ajouté rejouerait l'EPERM à l'identique.
    const inedit = join(HOME, "Documents", "openmasq-dossier-inexistant");
    const text = printProfile({ CLAUDE_SANDBOX_READ: inedit });
    expect(text).toContain(`(allow file-read-metadata (literal "${join(HOME, "Documents")}"))`);
  });
});
