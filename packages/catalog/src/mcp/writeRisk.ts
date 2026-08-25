import { findConnector } from "./registry";

/**
 * How dangerous is a MUTATING tool call — the single input to "which surface confirms it".
 *
 * WHY this exists. Every write used to be confirmed on a main-owned, un-spoofable window
 * (audit M6): a confirmation living in the app renderer's DOM is forgeable by a renderer
 * XSS, so main re-asked on a surface the renderer cannot script. Correct, but it means an
 * OS-level modal interrupts the conversation for the most ordinary actions. So the modal is
 * now reserved for the calls that can actually hurt, and everything else is confirmed by a
 * card INSIDE the conversation.
 *
 * ⚠️ THE TRADE-OFF, STATED. For a `"low"` call the in-conversation card is the ONLY
 * confirmation, and that card lives in the untrusted renderer — so a renderer XSS could
 * approve one without the user. That is acceptable ONLY because "low" is an ALLOW-LIST of
 * operations that are workspace-local, additive-or-reversible, and transmit nothing to a
 * third party. It is NOT acceptable for anything else, which is why every unlisted,
 * unknown or unparsed name is `"high"` — the classification fails CLOSED, and a mistake
 * costs a needless modal, never a silent send.
 *
 * Read the three lists below as: "deny the rest".
 */
export type WriteRisk = "low" | "high";

/**
 * Effects we are willing to confirm in-conversation. Each word names an operation whose
 * blast radius is the user's OWN copy of their OWN data: it does not reach another person,
 * does not destroy content, and can be undone from the same tool. Matched on the tool's
 * bare name, so `gmail__create_draft` and `notion__add_label` both land here.
 */
const LOW_RISK_EFFECT =
  /\b(draft|label|labels|tag|tags|star|starred|pin|pinned|favorite|favourite|bookmark|archive|unarchive|snooze|folder|rename|reminder|note|notes|task|tasks|todo|checklist|status|priority|due|read|unread|seen|title|description)\b/;

/** Verbs that stay inside the low-risk envelope. A low-risk EFFECT still needs a verb that
 *  isn't itself destructive — `delete_label` names a low-risk object and a high-risk act. */
const LOW_RISK_VERB = /\b(create|add|update|set|edit|modify|rename|save|apply|mark|move)\b/;

/** Operations that ARE their own verb: `archive_thread` names the act and the effect in one
 *  word, so demanding a separate verb would push a harmless call onto the modal. Kept as its
 *  own list rather than loosening the pair above — each entry is a deliberate admission. */
const LOW_RISK_SELF_OP =
  /\b(archive|unarchive|snooze|star|unstar|pin|unpin|bookmark|favorite|favourite|draft|rename)\b/;

/**
 * Anything that leaves the user's own workspace, destroys, or changes who can do what.
 * A single hit here is decisive: it OVERRIDES the allow-list above, because the dangerous
 * half of `create_and_send_draft` is the send. Kept broad on purpose — a false "high" is a
 * modal the user dismisses, a false "low" is an action nobody confirmed.
 */
const HIGH_RISK_EFFECT =
  /\b(send|share|shared|invite|publish|post|broadcast|notify|email|mail|message|sms|call|deploy|release|transfer|pay|payment|charge|refund|order|purchase|checkout|subscribe|delete|remove|purge|wipe|erase|drop|truncate|destroy|revoke|terminate|cancel|reset|overwrite|replace|restore|rollback|merge|migrate|grant|permission|permissions|role|roles|admin|access|disable|enable|install|uninstall|execute|exec|run|eval|shell|command|script|password|secret|token|key|credential|billing|invoice|contract|sign|signature)\b/;

export interface WriteRiskContext {
  /** The server/connector instance the tool belongs to (the part before `__`). */
  serverId?: string;
  /** Server-declared hints. They may only RAISE the risk, never lower it — a compromised
   *  server must not be able to talk its way onto the quieter surface. */
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  /** The turn carries files. The loop already treats attachments as a reason to confirm;
   *  here they also mean "not the quiet path". */
  hasAttachments?: boolean;
  /** How many exfiltration signals the agent loop raised on these args (its own scan).
   *  Any signal at all ⇒ high: the whole point of the modal is calls like this one. */
  exfilFlags?: number;
}

/**
 * Classify a write. `realName` is the tool's REAL name (`gmail__create_draft`), never the
 * model-facing alias.
 *
 * Order matters and is deliberate: every veto is evaluated BEFORE the allow-list, so no
 * combination of a friendly-looking name and a hostile context can reach `"low"`.
 */
export function writeRisk(realName: string, ctx: WriteRiskContext = {}): WriteRisk {
  if (typeof realName !== "string" || !realName.trim()) return "high";
  if (ctx.annotations?.destructiveHint === true) return "high";
  if (ctx.hasAttachments) return "high";
  if ((ctx.exfilFlags ?? 0) > 0) return "high";

  // A server we do not ship is a server whose tool semantics we cannot vouch for: a
  // user-added stdio/remote endpoint can name a nuclear operation `update_status`.
  // Unknown origin ⇒ the un-spoofable window, always.
  if (!ctx.serverId || !findConnector(ctx.serverId)) return "high";

  const bare = realName.includes("__") ? realName.slice(realName.indexOf("__") + 2) : realName;
  const words = bare.replace(/[_\-.]+/g, " ").toLowerCase();
  if (HIGH_RISK_EFFECT.test(words)) return "high";
  if (LOW_RISK_SELF_OP.test(words)) return "low";
  if (!LOW_RISK_EFFECT.test(words) || !LOW_RISK_VERB.test(words)) return "high";
  return "low";
}

/** Does this call get the main-owned modal? The inverse of `writeRisk === "low"`, named
 *  positively so call sites read as the gate they are. */
export function needsSystemConfirm(realName: string, ctx: WriteRiskContext = {}): boolean {
  return writeRisk(realName, ctx) === "high";
}
