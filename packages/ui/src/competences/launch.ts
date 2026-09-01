import { findConnector } from "@openmasq/catalog/mcp";
import type { Competence } from "../types";

/**
 * WHAT A COMPÉTENCE DOES AT THE MOMENT IT IS USED — the text it adds to the
 * model payload, and the tool scope it opens.
 *
 * Separated from `competences.ts` (which only knows how to store a list) because this
 * is where the product's one behaviour rule lives:
 *
 * > **A compétence that names connectors uses them.**
 *
 * Without `servers`, everything that follows is inert: the prompt goes out bare, the
 * turn's tool scope is the usual one. This is what makes merging the two old lists
 * lossless — what the app used to call "workflow" was a compétence whose `servers`
 * is not empty, and nothing else.
 */

/** Presentation shape for one of a compétence's MCP servers (chips, avatars). */
export interface CompetenceServerMeta {
  id: string;
  name: string;
  /** Design-system hue name (`--hl-*`), defaulted when the catalog has none. */
  tone: string;
}

/** Catalog lookup with a graceful degrade: an id the registry no longer knows
 *  (a renamed connector in an old saved entry) still renders as itself. */
export function competenceServerMeta(id: string): CompetenceServerMeta {
  const c = findConnector(id);
  return { id, name: c?.name ?? id, tone: c?.tone ?? "violet" };
}

export function competenceServers(c: Pick<Competence, "servers">): CompetenceServerMeta[] {
  return (c.servers ?? []).map(competenceServerMeta);
}

/** True when the compétence drives tools — the only test that decides a
 *  different behaviour, everywhere. */
export function drivesTools(c: Pick<Competence, "servers">): boolean {
  return (c.servers ?? []).length > 0;
}

/**
 * The VALUES TO FILL IN of a prompt: `{date}`, `{sujet}`, `{dépôt}`… This is the
 * convention the edit modal documents and that all our starter templates follow
 * (`suggestions/competenceTemplates.ts`).
 *
 * Ordered by first appearance, deduplicated. An empty or multi-line brace
 * is not one (`{}`, a code block) and is not kept.
 */
export function promptSlots(prompt: string): string[] {
  const found = prompt.match(/\{([^{}\n]{1,60})\}/g) ?? [];
  const labels = found.map((m) => m.slice(1, -1).trim()).filter(Boolean);
  return [...new Set(labels)];
}

/** How many brace pills the CHIP shows before folding into « +N ». */
const SLOT_PILLS_MAX = 4;

/**
 * The pills to SHOW on the chip, and the ones folded behind « +N » — a
 * legal/template prompt easily carries 15-30 `{braces}`, and one pill per brace
 * used to blow up the composer's row (reported 13/08). The fold keeps the reminder
 * (« blanks to fill in ») without breaking the layout; the full list stays
 * readable on hover (title) and in the prompt preview.
 */
export function cappedSlots(slots: string[], max = SLOT_PILLS_MAX): { shown: string[]; hidden: string[] } {
  if (slots.length <= max) return { shown: slots, hidden: [] };
  return { shown: slots.slice(0, max), hidden: slots.slice(max) };
}

/**
 * The TEXT a used compétence prepends to the MODEL payload (`send/sendOrchestrator.ts`):
 * the prompt, plus — when it is scoped to servers — one guidance line naming the
 * connectors to use. This is what makes `servers` EFFECTIVE at execution (the agent
 * routes by the instruction), while staying honest: the SAME text is the staged chip's
 * hover-peek, so the user sees exactly what will be prepended — never an invisible
 * side-channel. Guidance for the model — the agent loop's tool gates are unchanged by it.
 *
 * ⚠️ The `{braces}` go out AS-IS on the wire — that is the design: they get
 * filled in in the message the user writes next to the chip. But nothing told
 * the MODEL that, which received « Prépare ma journée du {date}. » with not the
 * slightest indication of what `{date}` is (log from 27/07/2026, user message: « go »).
 * Hence the second guidance line: it names the values, says where to find them, and
 * forbids inventing one — it is a blank in the request, not a datum to fill in.
 */
export function competenceLaunchText(c: Pick<Competence, "prompt" | "servers">): string {
  const names = competenceServers(c).map((s) => s.name);
  const slots = promptSlots(c.prompt);
  let out = c.prompt.trimEnd();
  if (names.length)
    out += `\n\n(Utilise ${names.length > 1 ? "les connecteurs" : "le connecteur"} : ${names.join(", ")}.)`;
  if (slots.length)
    out +=
      `\n\n(${slots.map((s) => `{${s}}`).join(", ")} ${slots.length > 1 ? "sont des valeurs" : "est une valeur"} ` +
      `à renseigner : déduis-${slots.length > 1 ? "les" : "la"} du message de l'utilisateur ou de la date du jour. ` +
      `Si ce n'est pas possible, DEMANDE — n'invente aucune valeur et ne recopie jamais les accolades.)`;
  return out;
}

/**
 * The connector scope in effect in a conversation — the one declared by the
 * LAST tool-driving compétence used in it.
 *
 * ⚠️ A scope must survive its own first message. A routine that asks a
 * clarifying question (« depuis quelle date ? ») gets its answer on the NEXT turn, which
 * carries no compétence — and the scope was read from that single send, so the router
 * pruned the very connector the routine names, its follow-up never went out, and the
 * model ended up without the Gmail tool on the exact turn that needed it (log from
 * 02/08/2026). The data was on the message from the start.
 *
 * The last launch WINS (a second routine replaces the first), and the scope only
 * WIDENS the tools on offer — the budget cap and every call-time barrier stay
 * unchanged — so carrying it forward can never turn a valid turn into a
 * refused one.
 *
 * ⚠️ Reads BOTH forms: `message.competence` (what we write now) and `message.workflow`
 * (what is already in everyone's history). Reading only the new one would
 * break scope carry-over for every existing conversation.
 */
export function activeCompetenceScope(
  messages: readonly {
    role: string;
    competence?: { servers?: string[] };
    workflow?: { servers?: string[] };
  }[],
): string[] | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const tag = m.competence ?? m.workflow;
    if (!tag) continue;
    // A compétence WITHOUT a connector redefines nothing: it passes its turn, it does
    // not close a scope opened two turns earlier. That is what a pre-merge compétence
    // already did (it had no effect on tools), and the only case this shifts is an
    // ex-workflow saved with ZERO connectors, which used to close the scope: no
    // longer closing it only WIDENS the offer, which the budget cap and the
    // call-time barriers already bound.
    if (!tag.servers?.length) continue;
    return tag.servers;
  }
  return undefined;
}
