import { homedir } from "node:os";
import { join } from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { handle } from "./ipc/handle";
import { getLiveFs } from "./fs/live";

/**
 * « Importer mes compétences Claude » — l'ÉNUMÉRATION, côté privilégié.
 *
 * ⚠️ Le renderer ne fournit AUCUN chemin. Ce module énumère des racines qu'il connaît
 * lui-même et ne lit qu'un fichier au nom fixe (`SKILL.md`) : ce n'est donc pas le
 * read-gate élargi (qui n'accorde un chemin que par le dialogue natif), c'est une
 * capacité ALLOW-listée d'une seule forme (règle 7). Un XSS du renderer peut appeler ce
 * canal autant qu'il veut : il en ressortira les mêmes SKILL.md, jamais un fichier choisi.
 *
 * Deux gisements, aucun nouveau droit :
 *  1. `~/.claude/skills/` — les compétences personnelles de Claude Code.
 *  2. `<dossier déjà accordé>/.claude/skills/` — celles d'un dépôt sur lequel on travaille.
 *     Ces dossiers ont déjà été accordés au connecteur Fichiers par le dialogue natif ;
 *     on ne s'en attribue aucun, on relit ceux que l'utilisateur a donnés.
 *
 * ⛔ `~/.claude/plugins/**` est EXCLU : ce sont des compétences de plugins tiers qui
 * pilotent des outils de Claude Code — inutiles comme prompts, et les importer noierait
 * les siennes sous des dizaines d'entrées qu'il n'a pas écrites.
 */

/** Bornes : un dossier hostile ne doit ni saturer la mémoire ni geler l'énumération. */
const MAX_SKILLS = 200;
const MAX_BYTES = 256 * 1024;
const MAX_SIBLINGS = 50;

interface RawSkill {
  folder: string;
  text: string;
  siblings: string[];
  /** D'où il vient — l'écran d'import le montre pour lever l'ambiguïté entre deux
   *  compétences homonymes (personnelle vs celle du dépôt). */
  from: "home" | "project";
}

/** Les fichiers du dossier autres que SKILL.md — juste leurs NOMS (jamais le contenu) :
 *  ils servent à dire « ce skill s'appuie sur N fichiers qui ne seront pas importés ». */
function siblingNames(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.name !== "SKILL.md" && !e.name.startsWith("."))
      .slice(0, MAX_SIBLINGS)
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  } catch {
    return [];
  }
}

function scanRoot(root: string, from: RawSkill["from"], out: RawSkill[]): void {
  let entries: string[];
  try {
    entries = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return; // racine absente : ce gisement n'existe pas ici, ce n'est pas une erreur
  }
  for (const folder of entries) {
    if (out.length >= MAX_SKILLS) return;
    const file = join(root, folder, "SKILL.md");
    try {
      if (statSync(file).size > MAX_BYTES) continue;
      out.push({ folder, text: readFileSync(file, "utf8"), siblings: siblingNames(join(root, folder)), from });
    } catch {
      /* pas de SKILL.md dans ce sous-dossier : ce n'est pas un skill, on passe */
    }
  }
}

function listClaudeSkills(): RawSkill[] {
  const out: RawSkill[] = [];
  scanRoot(join(homedir(), ".claude", "skills"), "home", out);
  // Les dossiers accordés au connecteur Fichiers : c'est là que vivent les compétences
  // d'un dépôt. Rien n'est accordé ici — on relit ce qui l'a déjà été.
  for (const root of getLiveFs()?.roots ?? []) {
    if (out.length >= MAX_SKILLS) break;
    scanRoot(join(root, ".claude", "skills"), "project", out);
  }
  return out;
}

export function registerClaudeSkillsIpc(): void {
  handle("claude-skills:list", [], () => listClaudeSkills());
}
