import { getMessages, LOCALES } from "@openmasq/i18n";
import { SKILL_CATEGORIES } from "../skills/skills";
import { findConnector } from "@openmasq/catalog/mcp";

/**
 * The block the MODEL emits when asked to build a compétence or a
 * workflow — and its parsing, pure and tested.
 *
 * Why here: `suggestions/` is already the ONE home for the starters the two
 * writing modals share (rule 9, « ONE home so the two sibling lists' picking
 * rules can't drift »). A proposal from the model is the same thing coming from
 * elsewhere: it PRE-FILLS a creation, it does not install it. The user is the one who clicks.
 *
 * ⚠️ **The format is tolerant BECAUSE the block arrives streamed.** It paints while
 * the model writes, so every intermediate state must read without crashing: a
 * title alone is already something to show, and `isComplete` — never `parse` — decides
 * whether the add button is allowed to exist. JSON would have made every partial
 * state unreadable and turned a missing comma into an empty card.
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
  /** Compétence only — validated category id, never the model's raw value. */
  cat?: string;
  /** Workflow only — connector ids from the CATALOGUE, unknown ones discarded. */
  servers: string[];
  prompt: string;
}

/** The label languages we accept. The model replies in the user's
 *  language (system prompt rule), so the label follows — and an unrecognized
 *  key is not lost: it falls back into the prompt. */
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

/** A compétence category, only if it EXISTS — otherwise the model invents an
 *  identifier that would show up nowhere. Tolerates the label (« Rédaction ») as much
 *  as the id (« redaction »), regardless of accents or case. */
function resolveCat(raw: string): string | undefined {
  const k = stripAccents(raw.trim().toLowerCase());
  // The LABEL is accepted in ALL shipped languages: the model writes in the
  // conversation's language, which is not necessarily the interface's.
  return SKILL_CATEGORIES.find(
    (c) =>
      c.id === k ||
      LOCALES.some(
        (loc) => stripAccents(getMessages(loc).lists.competenceCategories[c.id].toLowerCase()) === k,
      ),
  )?.id;
}

/** The connectors, resolved against the CATALOGUE: an id invented by the model must
 *  never land in `Workflow.servers`, which the app later reads to show
 *  brands and frame routing. Whatever doesn't resolve is simply discarded. */
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
 * Parses a block. NEVER throws and never returns `null`: a half-written block returns
 * what it already has (`isComplete` decides whether to show the button). `kind` comes from
 * the fence's closing tag, never from the content — the model does not choose the rail
 * via a word it might write in the middle.
 */
export function parseProposedSkill(kind: ProposedSkill["kind"], text: string): ProposedSkill {
  const lines = text.split("\n");
  let name = "";
  let desc = "";
  let cat: string | undefined;
  let servers: string[] = [];
  let i = 0;

  // The title: the same convention as the « document » block (`# … `), so a single
  // reflex to hold for both the model and the reader.
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

  // The labels, as long as there are any. The `---` closes the header; without it, the
  // first line that isn't a known label closes it too — a model can forget the dashes.
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
 * Is there enough to CREATE? A name and a prompt, nothing more — these are exactly the
 * two fields `makeCompetence`/`makeWorkflow` require, and the rest have default
 * values. As long as this is false, the card shows with no button: adding from
 * a block still being written would create a truncated entry the user
 * would have to go clean up by hand.
 */
export function isCompleteSkill(s: ProposedSkill): boolean {
  return s.name.trim().length > 0 && s.prompt.trim().length > 0;
}

/**
 * The EXISTING entry that already matches this proposal — on the two fields that
 * define an adoption's identity (name + prompt, whitespace-insensitive). This is what
 * makes adoption IDEMPOTENT and the "Ajouté" state DERIVABLE: the card's button
 * used to hold an instance's React state, and since the message list is VIRTUALIZED,
 * a scroll was enough to remount the card with its button rearmed — every re-click created
 * a duplicate (reported 13/08). A state derived from the LIST survives remount AND reload.
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
