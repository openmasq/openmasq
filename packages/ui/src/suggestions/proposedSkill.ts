import { COMPETENCE_CATEGORIES } from "../competences/competences";
import { findConnector } from "@openmasq/catalog/mcp";

/**
 * Le bloc que le MODÈLE émet quand on lui demande de fabriquer une compétence ou un
 * workflow — et sa lecture, pure et testée.
 *
 * Pourquoi ici : `suggestions/` est déjà le foyer UNIQUE des amorces que les deux
 * modales d'écriture partagent (règle 9, « ONE home so the two sibling lists' picking
 * rules can't drift »). Une proposition du modèle est la même chose venue d'ailleurs :
 * elle PRÉ-REMPLIT une création, elle ne l'installe pas. C'est l'utilisateur qui clique.
 *
 * ⚠️ **Le format est tolérant PARCE QUE le bloc arrive en flux.** Il se peint pendant
 * que le modèle écrit, donc chaque état intermédiaire doit se lire sans planter : un
 * titre seul est déjà quelque chose à montrer, et `isComplete` — jamais `parse` — dit
 * si le bouton d'ajout a le droit d'exister. Un JSON aurait rendu tout état partiel
 * illisible et transformé une faute de virgule en carte vide.
 *
 * ```competence
 * # Compte rendu d'entretien
 * catégorie: redaction
 * description: Structure un compte rendu à partir de notes brutes.
 * ---
 * Tu es un assistant qui rédige des comptes rendus…
 * ```
 */

export interface ProposedSkill {
  kind: "competence" | "workflow";
  name: string;
  desc: string;
  /** Compétence seulement — id de catégorie validé, jamais la valeur brute du modèle. */
  cat?: string;
  /** Workflow seulement — ids de connecteurs du CATALOGUE, les inconnus écartés. */
  servers: string[];
  prompt: string;
}

/** Les langues d'étiquette qu'on accepte. Le modèle répond dans la langue de
 *  l'utilisateur (règle du prompt système), donc l'étiquette suit — et une clé non
 *  reconnue n'est pas perdue : elle retombe dans le prompt. */
const KEYS: Record<string, "desc" | "cat" | "servers"> = {
  description: "desc",
  desc: "desc",
  résumé: "desc",
  resume: "desc",
  catégorie: "cat",
  categorie: "cat",
  category: "cat",
  cat: "cat",
  connecteurs: "servers",
  connecteur: "servers",
  connectors: "servers",
  outils: "servers",
  servers: "servers",
};

const stripAccents = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "");

/** Une catégorie de compétence, seulement si elle EXISTE — le modèle invente sinon un
 *  identifiant qui ne s'afficherait nulle part. Tolère le libellé (« Rédaction ») autant
 *  que l'id (« redaction »), accents et casse indifférents. */
function resolveCat(raw: string): string | undefined {
  const k = stripAccents(raw.trim().toLowerCase());
  return COMPETENCE_CATEGORIES.find(
    (c) => c.id === k || stripAccents(c.label.toLowerCase()) === k,
  )?.id;
}

/** Les connecteurs, résolus contre le CATALOGUE : un id inventé par le modèle ne doit
 *  jamais atterrir dans `Workflow.servers`, que l'app relit ensuite pour afficher des
 *  marques et cadrer le routage. Ce qui ne résout pas est simplement écarté. */
function resolveServers(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,;]/)) {
    const id = part.trim().toLowerCase();
    if (!id) continue;
    const found = findConnector(id);
    if (found && !out.includes(found.id)) out.push(found.id);
  }
  return out;
}

/**
 * Lire un bloc. Ne LÈVE jamais et ne rend jamais `null` : un bloc à moitié écrit rend
 * ce qu'il a déjà (`isComplete` tranche l'affichage du bouton). `kind` vient de la
 * balise de la clôture, jamais du contenu — le modèle ne choisit pas le rail par un
 * mot qu'il écrirait au milieu.
 */
export function parseProposedSkill(kind: ProposedSkill["kind"], text: string): ProposedSkill {
  const lines = text.split("\n");
  let name = "";
  let desc = "";
  let cat: string | undefined;
  let servers: string[] = [];
  let i = 0;

  // Le titre : la même convention que le bloc « document » (`# … `), donc un seul
  // réflexe à tenir pour le modèle comme pour le lecteur.
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const m = /^#{1,3}\s+(.+)$/.exec(l);
    if (m) {
      name = m[1].trim();
      i++;
    }
    break;
  }

  // Les étiquettes, tant qu'il y en a. Le `---` ferme l'en-tête ; sans lui, la première
  // ligne qui n'est pas une étiquette connue le ferme aussi — un modèle oublie le tiret.
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (/^-{3,}$/.test(l)) {
      i++;
      break;
    }
    const m = /^([\p{L}]+)\s*:\s*(.*)$/u.exec(l);
    const key = m && KEYS[stripAccents(m[1].toLowerCase())];
    if (!key) break;
    const val = m![2].trim();
    if (key === "desc") desc = val;
    else if (key === "cat") cat = resolveCat(val);
    else servers = resolveServers(val);
  }

  return { kind, name, desc, cat, servers, prompt: lines.slice(i).join("\n").trim() };
}

/**
 * A-t-on de quoi CRÉER ? Un nom et un prompt, rien de plus — ce sont exactement les
 * deux champs que `makeCompetence`/`makeWorkflow` exigent, et le reste a des valeurs
 * par défaut. Tant que c'est faux, la carte se montre sans bouton : un ajout à partir
 * d'un bloc encore en train de s'écrire créerait une entrée tronquée que l'utilisateur
 * devrait aller nettoyer à la main.
 */
export function isCompleteSkill(s: ProposedSkill): boolean {
  return s.name.trim().length > 0 && s.prompt.trim().length > 0;
}

/**
 * L'entrée EXISTANTE qui correspond déjà à cette proposition — sur les deux champs qui
 * définissent l'identité d'une adoption (nom + prompt, espaces indifférents). C'est ce
 * qui rend l'adoption IDEMPOTENTE et l'état « Ajouté » DÉRIVABLE : le bouton de la carte
 * gardait un état React d'instance, et la liste des messages étant VIRTUALISÉE, un
 * scroll suffisait à remonter la carte bouton réarmé — chaque re-clic créait un
 * doublon (signalé 13/08). Un état dérivé de la LISTE survit au remount ET au reload.
 */
export function findExistingSkill(
  list: readonly { id: string; name: string; prompt: string }[] | undefined,
  skill: Pick<ProposedSkill, "name" | "prompt">,
): { id: string } | undefined {
  const name = skill.name.trim();
  const prompt = skill.prompt.trim();
  if (!name || !prompt) return undefined;
  return list?.find((c) => c.name.trim() === name && c.prompt.trim() === prompt);
}
