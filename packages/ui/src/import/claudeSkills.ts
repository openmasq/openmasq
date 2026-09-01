/**
 * Importing **Claude compétences** into the app — the parsing, pure.
 *
 * A Claude skill is a `<name>/SKILL.md` folder: a YAML frontmatter (`name`,
 * `description`) then a Markdown body. The mapping to the app is direct —
 * the body IS the prompt — and that is what makes the import possible in two clicks.
 *
 * ⚠️ **What does not carry over.** A skill can bundle scripts, a `references/`,
 * assets; an app compétence is a prompt, period. A skill whose body says
 * « lis `readme.md` et explore les autres fichiers » therefore arrives as an instruction
 * to open files that are absent. It is not rejected — it is FLAGGED (`needsFiles`), so
 * the import screen says so beforehand, rather than usage saying so after.
 */

/** A `SKILL.md` as it was read — wherever it comes from (disk or repo). */
export interface RawSkillFile {
  /** The skill's FOLDER name: that is what names it, not the file (always SKILL.md). */
  folder: string;
  /** The raw content of the `SKILL.md`. */
  text: string;
  /** The folder's other files (relative names). Empty = self-contained skill. */
  siblings?: string[];
}

/** A compétence ready to create, plus what the import screen must say about it. */
export interface ParsedSkill {
  name: string;
  desc: string;
  prompt: string;
  /** The body refers to folder files, which will NOT be imported. */
  needsFiles: boolean;
  /** How many extra files the folder carries (0 = self-contained). */
  extras: number;
  /** The app's guess: this looks like a WORKFLOW (it drives tools) rather than a
   *  compétence. A guess, hence editable line by line in the preview. */
  looksLikeWorkflow: boolean;
}

/** Splits off the leading YAML frontmatter. Returns `{}` when there is none — a SKILL.md
 *  with no frontmatter stays importable, it just loses its declared name. */
export function splitFrontmatter(text: string): { fm: Record<string, string>; body: string } {
  const t = text.replace(/^﻿/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t);
  if (!m) return { fm: {}, body: t.trim() };
  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    // Deliberately minimal: `key: value`. Rich YAML (lists, blocks) does not exist
    // in the two fields we care about, and a full parser here would be one more
    // dependency just to read two lines.
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    fm[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { fm, body: t.slice(m[0].length).trim() };
}

/** The words that betray a tool-driven routine rather than a writing instruction. */
const TOOL_HINTS =
  /\b(mcp|connecteur|connector|outil|outils|tool|tools|gmail|slack|notion|drive|calendar|jira|linear|github|api|webhook|navigat|browser|scrape)\b/i;

/** A body that refers to its own files: « lis X.md », a relative link, a path. */
const FILE_REF = /\b(?:read|lis|lire|ouvre|voir|see|consulte)\b[^\n]{0,40}\.(?:md|py|js|ts|json|csv|ya?ml)\b|\]\((?!https?:)[^)]+\.(?:md|py|js|ts|json|csv|ya?ml)\)/i;

/** Readable name: the frontmatter if it exists, otherwise the "un-kebabed" folder name. */
function displayName(fm: Record<string, string>, folder: string): string {
  const raw = fm.name?.trim() || folder;
  const spaced = raw.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function parseSkill(file: RawSkillFile): ParsedSkill | null {
  const { fm, body } = splitFrontmatter(file.text);
  // With no body there is no prompt, so nothing to create — an empty folder is not a
  // compétence, and creating an empty shell for it would cost at use time.
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

/** Everything that was found, in the folder's alphabetical order — a stable order, so
 *  a list that does not jump around from one import to the next. */
export function parseSkills(files: readonly RawSkillFile[]): ParsedSkill[] {
  return files
    .map(parseSkill)
    .filter((s): s is ParsedSkill => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * The name to give so as to NEVER overwrite: « Résumé » already exists ⇒ « Résumé (2) ».
 * An import must be re-runnable without destroying what the user has since modified
 * — that is the only rule that makes the button safe to click twice.
 */
export function freeName(wanted: string, taken: ReadonlySet<string>): string {
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; i < 500; i++) {
    const candidate = `${wanted} (${i})`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${wanted} (${Date.now()})`;
}
