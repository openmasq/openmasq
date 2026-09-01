import type { Messages } from "@openmasq/i18n";
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
export const MAX_FEEDBACK_MESSAGE = 5000;

/**
 * Max length of the attached DEBUG JOURNAL (chars). Same server-authority contract
 * as `MAX_AVIS_MESSAGE` (the backend re-checks and 400s over-cap); the UI truncates
 * keeping the TAIL — the most recent entries are the ones a bug report needs.
 * ⚠️ The journal a draft may carry is the « sans mapping » export ONLY
 * (`entryText.ts` `toText(..., { mapping: false })`): the wire form that already
 * left the machine, with every redacted→réel pair stripped. Never hand
 * `debugJournalDraft` the full export.
 */
export const MAX_FEEDBACK_LOG = 20_000;

/** How the user says it's going. An enum, so it stays a signal, not a story. */
export type FeedbackMood = "love" | "ok" | "meh";
/** What kind of feedback it is. */
export type FeedbackCategory = "idea" | "bug" | "love" | "other";


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
   * The installation's PostHog identity (`analytics/posthog.ts` `analyticsDistinctId`)
   * — THE field that joins a feedback record to the telemetry of the installation that
   * sent it. Without it, a record and the PostHog events/errors of the same machine are
   * impossible to cross-reference, and a bug is diagnosed blind.
   * ⚠️ It is an ACCEPTED junction between the anonymous channel (analytics) and the
   * identified one (feedback): it exists only on the explicit gesture of sending
   * feedback, under the « contexte technique » switch, which the modal announces. A
   * machine id (installation uuid), never any content.
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
  attachLog?: boolean;
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
 * Draft prefilled by the « Signaler un masquage incorrect » affordance (the
 * redaction-mark popover / the document viewers). PRIVACY: `kindLabel` is the mark's
 * CATEGORY word ("e-mail", "nom"…) — a vocabulary term, never the value — and the
 * template explicitly tells the user not to paste the real value. `mood` stays null
 * on purpose: sentiment is the user's to pick, prefilling one would fake it.
 */
export function redactionProblemDraft(
  surface: RedactionProblemSurface,
  t: Messages,
  kindLabel?: string,
): FeedbackDraft {
  const a = t.modals.avis;
  const where =
    surface === "document" ? a.inDocument : surface === "reponse" ? a.inReply : a.inMessage;
  return {
    ...EMPTY_FEEDBACK,
    category: "bug",
    message: a.problemBody(where, kindLabel ? a.problemKind(kindLabel) : ""),
  };
}

/**
 * Cap a journal export, keeping the TAIL — the most recent entries are the ones a bug
 * report needs. One home for the rule (`debugJournalDraft`, the Bug-category offer in
 * the modal, and `buildFeedback`'s last-line re-cap all call it), because the server
 * 400s over-cap and three copies would drift into a bounce nobody could explain.
 */
export function capLog(log: string): string {
  const t = log.trim();
  return t.length > MAX_FEEDBACK_LOG ? t.slice(-MAX_FEEDBACK_LOG) : t;
}

/**
 * Draft prefilled by the journal de débogage's « Envoyer aux développeurs » button.
 * PRIVACY: `journal` MUST be the no-mapping export (`toText(entries, { mapping:
 * false })`) — the redacted wire text that already left the machine, never the
 * redacted→réel pairs. It is truncated tail-first here so the modal previews
 * EXACTLY what would be sent. `mood` stays null (sentiment is the user's to pick).
 */
export function debugLogDraft(log: string, t: Messages): FeedbackDraft {
  return {
    ...EMPTY_FEEDBACK,
    category: "bug",
    message: t.modals.avis.journalDraft,
    journal: capLog(log),
    attachLog: true,
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
export function messageFeedbackDraft(t: Messages, log?: string): FeedbackDraft {
  const attached = capLog(log ?? "");
  return {
    ...EMPTY_FEEDBACK,
    category: attached ? "bug" : EMPTY_FEEDBACK.category,
    message: t.modals.avis.replyDraft,
    ...(attached ? { journal: attached, attachLog: true } : {}),
  };
}

/** True when this draft actually ships the debug journal (present AND its toggle on).
 *  One home for the question — the send gate, the payload and the modal's copy all
 *  ask it, and three readings of the same test would drift.
 *  A journal that is PRESENT goes by default (`attachJournal !== false`, decision 13/08:
 *  collection is permanent so that feedback can carry it) — the modal's switch stays the
 *  refusal, visible and one gesture away, with a verbatim preview to back it. */
export function carriesLog(d: FeedbackDraft): boolean {
  return !!d.journal?.trim() && d.attachLog !== false;
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
  return (!!d.mood || carriesLog(d)) && d.message.trim().length > 2;
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
  const log = d.journal?.trim();
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
    ...(carriesLog(d) ? { journal: capLog(log!) } : {}),
  };
}
