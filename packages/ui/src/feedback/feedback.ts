import type { Messages } from "@openmasq/i18n";
/**
 * The AVIS payload + its pure rules — "Votre avis": the user telling US something.
 * React-free; the modal renders it and the TRANSPORT is injected (`Host.feedback`).
 *
 * ⚠️ PRIVACY. The one surface where the user DELIBERATELY sends us free text, so the UI
 * must not overpromise:
 *   • the message is what the user typed — the ONE box that is not redacted (it goes to
 *     the team, not to a model), which the docs say plainly;
 *   • NO e-mail field: identity comes from the VERIFIED token (rule 7);
 *   • `context` identifies the BUILD and the MACHINE only — never conversation content, a
 *     vault value, a prompt or a file. `buildFeedback` is what makes that true;
 *   • it does NOT go through the analytics sink, which is anonymous by construction.
 */

/** Max message length. The SERVER is the authority and refuses over-cap; this copy lets
 *  the textarea STOP the user at the limit instead of bouncing later. Keep them equal. */
export const MAX_FEEDBACK_MESSAGE = 5000;

/** Max length of the attached DEBUG JOURNAL (chars); the UI truncates keeping the TAIL.
 *  ⚠️ A draft may only carry the « sans mapping » export (`entryText.ts`
 *  `toText(..., { mapping: false })`): the wire form, every redacted→réel pair stripped. */
export const MAX_FEEDBACK_LOG = 20_000;

/** How the user says it's going. An enum, so it stays a signal, not a story. */
export type FeedbackMood = "love" | "ok" | "meh";
/** What kind of feedback it is. */
export type FeedbackCategory = "idea" | "bug" | "love" | "other";


/**
 * The technical context, attached ONLY when the user leaves the toggle on. Every field is
 * a MACHINE value (a version, a screen id, an OS string, a model id); the list may never
 * grow with anything describing what the user wrote. `buildFeedback` assembles it field by
 * field, never a spread, and the server re-allow-lists the same names.
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
  /** The installation's analytics identity (`analytics/posthog.ts`), THE field that joins
   *  a feedback record to the telemetry of the installation that sent it. An ACCEPTED
   *  junction between the anonymous and the identified channel: exists only on the
   *  explicit gesture of sending feedback, under the announced « contexte technique » switch. */
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
  const a = t.modals.feedback;
  const where =
    surface === "document" ? a.inDocument : surface === "reponse" ? a.inReply : a.inMessage;
  return {
    ...EMPTY_FEEDBACK,
    category: "bug",
    message: a.problemBody(where, kindLabel ? a.problemKind(kindLabel) : ""),
  };
}

/** Cap a journal export, keeping the TAIL. One home for the rule: the server refuses
 *  over-cap, and three copies would drift into a bounce nobody could explain. */
export function capLog(log: string): string {
  const t = log.trim();
  return t.length > MAX_FEEDBACK_LOG ? t.slice(-MAX_FEEDBACK_LOG) : t;
}

/** Draft prefilled by the journal's « Envoyer aux développeurs ». PRIVACY: `journal` MUST
 *  be the no-mapping export; truncated tail-first here so the modal previews EXACTLY what
 *  would be sent. `mood` stays null (sentiment is the user's to pick). */
export function debugLogDraft(log: string, t: Messages): FeedbackDraft {
  return {
    ...EMPTY_FEEDBACK,
    category: "bug",
    message: t.modals.feedback.logDraft,
    journal: capLog(log),
    attachLog: true,
  };
}

/**
 * Draft opened by the FEEDBACK action under a reply: the moment a reply disappoints is the
 * moment the report is worth most. The journal for THIS conversation is attached when
 * there is one (« sans mapping »), category « Bug » in that case. With debug mode off the
 * button still opens a normal avis rather than hiding.
 * PRIVACY: the template mentions the reply, it never QUOTES it.
 */
export function messageFeedbackDraft(t: Messages, log?: string): FeedbackDraft {
  const attached = capLog(log ?? "");
  return {
    ...EMPTY_FEEDBACK,
    category: attached ? "bug" : EMPTY_FEEDBACK.category,
    message: t.modals.feedback.replyDraft,
    ...(attached ? { journal: attached, attachLog: true } : {}),
  };
}

/** True when this draft actually ships the debug journal (present AND its toggle on). One
 *  home for the question: the send gate, the payload and the modal's copy all ask it.
 *  A PRESENT journal goes by default; the modal's switch is the visible refusal. */
export function carriesLog(d: FeedbackDraft): boolean {
  return !!d.journal?.trim() && d.attachLog !== false;
}

/**
 * A message of substance, PLUS a mood — except on a report that carries the journal: a
 * user attaching their journal has already said the sentiment by being here, so the
 * message alone gates the send. The server mirrors this rule.
 */
export function canSendFeedback(d: FeedbackDraft): boolean {
  return (!!d.mood || carriesLog(d)) && d.message.trim().length > 2;
}

/**
 * Assemble the payload actually sent. Returns null when the draft isn't sendable, so a
 * caller can't bypass the gate. This is the choke point for the privacy promise: `context`
 * is built HERE from named fields and omitted entirely when the toggle is off.
 */
export function buildFeedback(d: FeedbackDraft, ctx: FeedbackContext): Feedback | null {
  if (!canSendFeedback(d)) return null;
  const log = d.journal?.trim();
  return {
    // Omitted when unset — never a `mood: null` the server would have to interpret.
    ...(d.mood ? { mood: d.mood } : {}),
    category: d.category,
    message: d.message.trim(),
    // Field by field, deliberately — a spread of `ctx` would mean whatever a future caller
    // puts in it, and this line is the proof that no conversation content reaches the payload.
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
    // The journal rides when present unless explicitly REFUSED (`carriesLog`); re-capped
    // here so no caller can push an over-cap blob past the choke point.
    ...(carriesLog(d) ? { journal: capLog(log!) } : {}),
  };
}
