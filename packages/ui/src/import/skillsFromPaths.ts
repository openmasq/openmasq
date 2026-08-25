import type { RawSkillFile } from "./claudeSkills";

/** Un fichier tel qu'un dépôt (dossier, sélection, zip) l'a rendu : un chemin RELATIF au
 *  point de dépôt, et son texte. */
export interface DroppedFile {
  path: string;
  text: string;
}

const dirOf = (p: string): string => p.slice(0, Math.max(0, p.lastIndexOf("/")));
const baseOf = (p: string): string => p.slice(p.lastIndexOf("/") + 1);

/**
 * Ce qu'un DÉPÔT contient comme compétences — la règle, pure.
 *
 * **Deux formes valent une compétence, et deux seulement :**
 *  1. un dossier qui contient un `SKILL.md` (la forme Claude) ; le dossier le nomme, ses
 *     autres fichiers deviennent ses « annexes » ;
 *  2. un `.md` déposé À LA RACINE de la sélection — on a déposé CE fichier, il est donc
 *     l'objet du geste.
 *
 * ⚠️ **Un `.md` enfoui ne compte pas.** Déposer `~/.claude/skills` ramène des dossiers de
 * documentation entiers (`_lifecycles/` en contient dix) : les prendre pour des compétences
 * en fabriquerait dix que personne n'a écrites. Un `readme.md` posé à côté d'un `SKILL.md`
 * est une annexe, jamais une compétence — c'est la même règle vue de l'autre côté.
 */
export function skillsFromPaths(files: readonly DroppedFile[]): RawSkillFile[] {
  const norm = files
    .map((f) => ({ ...f, path: f.path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "") }))
    .filter((f) => f.path && !baseOf(f.path).startsWith("."));

  // Les dossiers porteurs d'un SKILL.md, et tout ce qu'ils contiennent.
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
      // Un SKILL.md déposé SEUL n'a pas de dossier parent : son propre nom fera l'affaire.
      folder: baseOf(dir) || "skill",
      text: skill.text,
      siblings: list.filter((f) => f !== skill).map((f) => baseOf(f.path)),
    });
  }

  // Les `.md` déposés à la racine : c'est le fichier lui-même qu'on a lâché.
  for (const f of norm) {
    if (claimed.has(f.path) || dirOf(f.path)) continue;
    if (!/\.md$/i.test(f.path)) continue;
    out.push({ folder: baseOf(f.path).replace(/\.md$/i, ""), text: f.text, siblings: [] });
  }
  return out;
}
