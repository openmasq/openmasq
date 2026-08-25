/**
 * Importer les **compétences Claude** dans l'app — la lecture, pure.
 *
 * Un skill Claude est un dossier `<nom>/SKILL.md` : un frontmatter YAML (`name`,
 * `description`) puis un corps Markdown. La correspondance avec l'app est directe —
 * le corps EST le prompt — et c'est ce qui rend l'import possible en deux clics.
 *
 * ⚠️ **Ce qui ne traverse pas.** Un skill peut embarquer des scripts, un `references/`,
 * des assets ; une compétence de l'app est un prompt, point. Un skill dont le corps dit
 * « lis `readme.md` et explore les autres fichiers » arrive donc comme une instruction
 * d'ouvrir des fichiers absents. On ne le refuse pas — on le SIGNALE (`needsFiles`), pour
 * que l'écran d'import le dise avant, plutôt que l'usage après.
 */

/** Un `SKILL.md` tel qu'il a été lu — d'où qu'il vienne (disque ou dépôt). */
export interface RawSkillFile {
  /** Le nom du DOSSIER du skill : c'est lui qui nomme, pas le fichier (toujours SKILL.md). */
  folder: string;
  /** Le contenu brut du `SKILL.md`. */
  text: string;
  /** Les autres fichiers du dossier (noms relatifs). Vide = skill autoporteur. */
  siblings?: string[];
}

/** Une compétence prête à créer, plus ce que l'écran d'import doit dire à son sujet. */
export interface ParsedSkill {
  name: string;
  desc: string;
  prompt: string;
  /** Le corps renvoie à des fichiers du dossier, qui ne seront PAS importés. */
  needsFiles: boolean;
  /** Combien de fichiers annexes le dossier porte (0 = autoporteur). */
  extras: number;
  /** Le pari de l'app : ça ressemble à un WORKFLOW (ça pilote des outils) plutôt qu'à une
   *  compétence. Un pari, donc modifiable ligne par ligne dans l'aperçu. */
  looksLikeWorkflow: boolean;
}

/** Découpe le frontmatter YAML de tête. Rend `{}` quand il n'y en a pas — un SKILL.md
 *  sans frontmatter reste importable, il perdra juste son nom déclaré. */
export function splitFrontmatter(text: string): { fm: Record<string, string>; body: string } {
  const t = text.replace(/^﻿/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t);
  if (!m) return { fm: {}, body: t.trim() };
  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    // Volontairement minimal : `clé: valeur`. Le YAML riche (listes, blocs) n'existe pas
    // dans les deux champs qui nous intéressent, et un parseur complet ici serait une
    // dépendance de plus pour lire deux lignes.
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    fm[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { fm, body: t.slice(m[0].length).trim() };
}

/** Les mots qui trahissent une routine à outils plutôt qu'une consigne de rédaction. */
const TOOL_HINTS =
  /\b(mcp|connecteur|connector|outil|outils|tool|tools|gmail|slack|notion|drive|calendar|jira|linear|github|api|webhook|navigat|browser|scrape)\b/i;

/** Un corps qui renvoie à ses propres fichiers : « lis X.md », un lien relatif, un chemin. */
const FILE_REF = /\b(?:read|lis|lire|ouvre|voir|see|consulte)\b[^\n]{0,40}\.(?:md|py|js|ts|json|csv|ya?ml)\b|\]\((?!https?:)[^)]+\.(?:md|py|js|ts|json|csv|ya?ml)\)/i;

/** Nom lisible : le frontmatter s'il existe, sinon le dossier « dé-kebabisé ». */
function displayName(fm: Record<string, string>, folder: string): string {
  const raw = fm.name?.trim() || folder;
  const spaced = raw.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function parseSkill(file: RawSkillFile): ParsedSkill | null {
  const { fm, body } = splitFrontmatter(file.text);
  // Sans corps il n'y a pas de prompt, donc rien à créer — un dossier vide n'est pas une
  // compétence, et en créer une coquille se paierait à l'usage.
  if (!body) return null;
  const siblings = file.siblings ?? [];
  return {
    name: displayName(fm, file.folder),
    desc: (fm.description ?? "").trim(),
    prompt: body,
    extras: siblings.length,
    needsFiles: siblings.length > 0 && FILE_REF.test(body),
    looksLikeWorkflow: TOOL_HINTS.test(`${fm.description ?? ""} ${body.slice(0, 1200)}`),
  };
}

/** Tout ce qui a été trouvé, dans l'ordre alphabétique du dossier — un ordre stable, donc
 *  une liste qui ne danse pas d'un import à l'autre. */
export function parseSkills(files: readonly RawSkillFile[]): ParsedSkill[] {
  return files
    .map(parseSkill)
    .filter((s): s is ParsedSkill => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * Le nom à donner pour ne JAMAIS écraser : « Résumé » existe déjà ⇒ « Résumé (2) ».
 * Un import doit pouvoir être relancé sans détruire ce que l'utilisateur a modifié depuis
 * — c'est la seule règle qui rende le bouton sûr à cliquer deux fois.
 */
export function freeName(wanted: string, taken: ReadonlySet<string>): string {
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; i < 500; i++) {
    const candidate = `${wanted} (${i})`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${wanted} (${Date.now()})`;
}
