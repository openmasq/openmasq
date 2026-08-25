/**
 * The AVIS payload + its pure rules — "Votre avis" (the rail's speech-bubble
 * action): the user telling US something. React-free and unit-tested; the modal
 * only renders it, and the TRANSPORT is injected (`Host.avis`), so this file knows
 * nothing about where it goes.
 *
 * Named `avis/`, not `feedback/`, ON PURPOSE: `components/feedback/` already means
 * the OPPOSITE direction — banners/toasts, feedback shown TO the user. One word,
 * two concepts, and rule 2 forbids a domain living in two parallel folders. `avis`
 * is the product's own word for this one ("Envoyer un avis"), and matches the
 * French domain names already in the tree (`coffre`, `competences`).
 *
 * ⚠️ PRIVACY. This is the one surface where the user DELIBERATELY sends us free
 * text, so the contract has to be exact and the UI must not overpromise:
 *   • the message is what the user typed, on purpose — nothing here harvests it,
 *     and it is the ONE box in the app that is not redacted (it goes to the team,
 *     not to a model), which the docs say plainly;
 *   • there is NO e-mail field: the account is already authenticated, so the
 *     backend takes identity from the VERIFIED token (rule 7) and the form asks
 *     for nothing it already knows;
 *   • `context` carries what identifies the BUILD and the MACHINE — version, channel,
 *     screen, OS, model id, protection level — and nothing that describes what the
 *     user wrote: no conversation content, no vault value, no prompt, no file. The
 *     modal says so ("Jamais le contenu de vos conversations"), and `buildFeedback`
 *     is what makes it true — it can only ever assemble those named fields;
 *   • it does NOT go through the analytics sink. That pipeline is anonymous by
 *     construction (`analytics/events.ts` allows counts/enums/ids, never free text),
 *     and feedback carries prose + an identity. Mixing them would break the
 *     anonymity promise the consent banner makes.
 */

/**
 * Max message length. The SERVER is the authority — `apps/backend`'s
 * `validateFeedbackPayload` re-checks it and 400s over-cap (an unbounded body
 * relayed into an email is an abuse vector). This copy exists so the textarea can
 * STOP the user at the limit instead of letting them write 6000 characters and
 * then bounce; if the two ever drift, the server still wins and the UI just caps
 * early. Keep them equal.
 */
export const MAX_AVIS_MESSAGE = 5000;

/**
 * Max length of the attached DEBUG JOURNAL (chars). Same server-authority contract
 * as `MAX_AVIS_MESSAGE` (the backend re-checks and 400s over-cap); the UI truncates
 * keeping the TAIL — the most recent entries are the ones a bug report needs.
 * ⚠️ The journal a draft may carry is the « sans mapping » export ONLY
 * (`entryText.ts` `toText(..., { mapping: false })`): the wire form that already
 * left the machine, with every redacted→réel pair stripped. Never hand
 * `debugJournalDraft` the full export.
 */
export const MAX_AVIS_JOURNAL = 20_000;

/** How the user says it's going. An enum, so it stays a signal, not a story. */
export type FeedbackMood = "love" | "ok" | "meh";
/** What kind of feedback it is. */
export type FeedbackCategory = "idea" | "bug" | "love" | "other";

export const FEEDBACK_MOODS: { id: FeedbackMood; glyph: string; label: string; tone: string }[] = [
  // Glyphs are mono-font faces (the kit's), not emoji — Space Mono renders them.
  { id: "love", glyph: "◕‿◕", label: "J'adore", tone: "lime" },
  { id: "ok", glyph: "•‿•", label: "Correct", tone: "sky" },
  { id: "meh", glyph: "•︵•", label: "Bof", tone: "amber" },
];

export const FEEDBACK_CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: "idea", label: "Idée" },
  { id: "bug", label: "Bug" },
  { id: "love", label: "Compliment" },
  { id: "other", label: "Autre" },
];

/**
 * The technical context, attached ONLY when the user leaves the toggle on.
 *
 * ⚠️ Every field here is a MACHINE value — a version, a screen id, an OS string, a
 * channel, a model id, a level name. That is the invariant, not the field count: the
 * list may grow with what makes a report reproducible, and may never grow with
 * anything that describes what the user wrote, asked or attached. `buildFeedback`
 * assembles it field by field (never a spread) so the choke point stays readable, and
 * the backend re-allow-lists the same names.
 */
export interface FeedbackContext {
  /** App version, e.g. "4.8.0". */
  version?: string;
  /** The screen the user was on, e.g. "chats" — a Section id, never its content. */
  section?: string;
  /** "darwin 24.4.0 (arm64)" — platform, release, arch. Absent off the desktop. */
  os?: string;
  /** The update channel this build runs on. Without it a staging report and a real
   *  user's are indistinguishable — the version alone doesn't separate them. */
  channel?: string;
  /** The model the conversation was on — the id, never a message. */
  model?: string;
  /** The protection LEVEL's name ("standard"/"renforce"/"strict"/"custom"), never the
   *  category map: which categories a user turned off describes the user. */
  level?: string;
  /**
   * L'identité PostHog de l'installation (`analytics/posthog.ts` `analyticsDistinctId`)
   * — LE champ qui joint une fiche de feedback à la télémétrie de l'installation qui
   * l'a envoyée. Sans lui, une fiche et les événements/erreurs PostHog du même poste
   * sont impossibles à recouper, et un bug se diagnostique à l'aveugle.
   * ⚠️ C'est une jonction ASSUMÉE entre le canal anonyme (analytics) et le canal
   * identifié (avis) : elle n'existe que sur le geste explicite d'envoyer un avis,
   * sous l'interrupteur « contexte technique », que la modale annonce. Un id machine
   * (uuid d'installation), jamais un contenu.
   */
  analyticsId?: string;
}

export interface Feedback {
  /** Absent on a report that CARRIES THE JOURNAL — see `canSendFeedback`. */
  mood?: FeedbackMood;
  category: FeedbackCategory;
  message: string;
  /** Absent when the user turned the toggle off. */
  context?: FeedbackContext;
  /** The debug journal's « sans mapping » export (wire form, no vault value — each
   *  pair rides as a SHAPE template + per-category counts instead, `entryText.ts`
   *  `shapeBlock`) — present only when the report came from the journal AND the user
   *  left its toggle on. Capped at `MAX_AVIS_JOURNAL` (tail kept). */
  journal?: string;
}

/** The form state the modal edits. */
export interface FeedbackDraft {
  mood: FeedbackMood | null;
  category: FeedbackCategory;
  message: string;
  attachContext: boolean;
  /** The « sans mapping » journal export the modal shows VERBATIM (the user must SEE
   *  what would leave). Two ways in, and no third: `debugJournalDraft` (the journal's
   *  own « Envoyer aux développeurs »), or the user turning the switch on for a Bug
   *  report. Never filled behind their back. */
  journal?: string;
  /** Whether the journal actually rides the payload (its own toggle: ON when the
   *  journal seeded the draft, OFF until asked on a Bug report). */
  attachJournal?: boolean;
}

export const EMPTY_FEEDBACK: FeedbackDraft = {
  mood: null,
  category: "idea",
  message: "",
  attachContext: true,
};

/** Where a redaction problem was noticed — phrases the prefilled message. */
export type RedactionProblemSurface = "message" | "reponse" | "document";

/**
 * Draft prefilled by the « Signaler un redaction incorrect » affordance (the
 * redaction-mark popover / the document viewers). PRIVACY: `kindLabel` is the mark's
 * CATEGORY word ("e-mail", "nom"…) — a vocabulary term, never the value — and the
 * template explicitly tells the user not to paste the real value. `mood` stays null
 * on purpose: sentiment is the user's to pick, prefilling one would fake it.
 */
export function redactionProblemDraft(
  surface: RedactionProblemSurface,
  kindLabel?: string,
): FeedbackDraft {
  const where =
    surface === "document" ? "dans un document" : surface === "reponse" ? "dans une réponse" : "dans un message";
  const kind = kindLabel ? ` (type : ${kindLabel})` : "";
  return {
    ...EMPTY_FEEDBACK,
    category: "bug",
    message: `Redaction incorrect${kind} ${where}.\nCe qui n'allait pas (sans coller la valeur réelle) : `,
  };
}

/**
 * Cap a journal export, keeping the TAIL — the most recent entries are the ones a bug
 * report needs. One home for the rule (`debugJournalDraft`, the Bug-category offer in
 * the modal, and `buildFeedback`'s last-line re-cap all call it), because the server
 * 400s over-cap and three copies would drift into a bounce nobody could explain.
 */
export function capJournal(journal: string): string {
  const t = journal.trim();
  return t.length > MAX_AVIS_JOURNAL ? t.slice(-MAX_AVIS_JOURNAL) : t;
}

/**
 * Draft prefilled by the journal de débogage's « Envoyer aux développeurs » button.
 * PRIVACY: `journal` MUST be the no-mapping export (`toText(entries, { mapping:
 * false })`) — the redacted wire text that already left the machine, never the
 * redacted→réel pairs. It is truncated tail-first here so the modal previews
 * EXACTLY what would be sent. `mood` stays null (sentiment is the user's to pick).
 */
export function debugJournalDraft(journal: string): FeedbackDraft {
  return {
    ...EMPTY_FEEDBACK,
    category: "bug",
    message: "Rapport depuis le journal de débogage.\nCe qui n'allait pas : ",
    journal: capJournal(journal),
    attachJournal: true,
  };
}

/**
 * Draft opened by the FEEDBACK action under a reply (the `msg-actions` row, beside
 * Copier / Régénérer / Forker). The point of that button is reach: the moment a
 * reply disappoints is the moment the report is worth most, and asking the user to
 * find a rail, then a modal, then re-describe the context loses it.
 *
 * So the draft arrives ready: the journal for THIS conversation already attached
 * when there is one (the same « sans mapping » export as everywhere else — wire
 * text, no vault value), category « Bug » because that is what a journal reports,
 * and a template that only asks what went wrong. With debug mode off there is no
 * journal; the button still opens a normal avis rather than hiding, because someone
 * who wants to say something should never be told to go turn on a setting first.
 *
 * PRIVACY: the template mentions the reply, it never QUOTES it. Nothing about the
 * conversation reaches the payload beyond what the journal already carries — and the
 * modal shows that verbatim before anything is sent.
 */
export function messageFeedbackDraft(journal?: string): FeedbackDraft {
  const attached = capJournal(journal ?? "");
  return {
    ...EMPTY_FEEDBACK,
    category: attached ? "bug" : EMPTY_FEEDBACK.category,
    message: "À propos de cette réponse : ",
    ...(attached ? { journal: attached, attachJournal: true } : {}),
  };
}

/** True when this draft actually ships the debug journal (present AND its toggle on).
 *  One home for the question — the send gate, the payload and the modal's copy all
 *  ask it, and three readings of the same test would drift.
 *  Un journal PRÉSENT part par défaut (`attachJournal !== false`, décision 13/08 : la
 *  collecte est permanente pour que l'avis l'embarque) — l'interrupteur du modal reste
 *  le refus, visible et à un geste, aperçu verbatim à l'appui. */
export function carriesJournal(d: FeedbackDraft): boolean {
  return !!d.journal?.trim() && d.attachJournal !== false;
}

/**
 * A message of substance, PLUS a mood — except on a report that carries the journal.
 *
 * The mood is a signal, and it earns its mandatory status on a spontaneous avis: a
 * bare "ok" with no sentiment tells the team nothing. But a user who just hit a bug
 * and is attaching their journal has already told us the sentiment by being here,
 * and making them rate their mood first is a toll on the exact report we most want.
 * The journal IS the signal in that case, so the mood becomes optional and the
 * message alone gates the send. (The server mirrors this rule — `apps/backend`'s
 * `validateFeedbackPayload` requires `mood` only when no `journal` rides.)
 */
export function canSendFeedback(d: FeedbackDraft): boolean {
  return (!!d.mood || carriesJournal(d)) && d.message.trim().length > 2;
}

/**
 * Assemble the payload actually sent. Returns null when the draft isn't sendable,
 * so a caller can't bypass the gate.
 *
 * This is the choke point for the privacy promise: `context` is built HERE from
 * the two allowed fields and is omitted entirely when the toggle is off — there is
 * no path by which conversation content reaches the payload.
 */
export function buildFeedback(d: FeedbackDraft, ctx: FeedbackContext): Feedback | null {
  if (!canSendFeedback(d)) return null;
  const journal = d.journal?.trim();
  return {
    // Omitted entirely when unset — the payload never carries a `mood: null` the
    // server would have to interpret. Only reachable on a journal-carrying report
    // (`canSendFeedback` is the gate that allows it).
    ...(d.mood ? { mood: d.mood } : {}),
    category: d.category,
    message: d.message.trim(),
    // Field by field, deliberately — a spread of `ctx` would mean whatever a future
    // caller happens to put in it, and this is the line that has to stay readable as
    // the proof that no conversation content can reach the payload.
    ...(d.attachContext
      ? {
          context: {
            version: ctx.version,
            section: ctx.section,
            os: ctx.os,
            channel: ctx.channel,
            model: ctx.model,
            level: ctx.level,
            analyticsId: ctx.analyticsId,
          },
        }
      : {}),
    // The journal rides when present, unless its toggle was explicitly REFUSED
    // (`carriesJournal`, one home) — re-capped here so no caller can push an
    // over-cap blob past the choke point.
    ...(carriesJournal(d) ? { journal: capJournal(journal!) } : {}),
  };
}
