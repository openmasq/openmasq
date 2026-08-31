// The « DRAFT ≠ SEND » guard, extracted from `mcpAgentClassify.ts` to keep it under
// the 300-line ceiling (rule 1). Re-exported there, so invisible to importers —
// the same pattern as `mcpAgentGuidance.ts` → `mcpAgentPython.ts`.

/**
 * « RÉDIGER » (DRAFT) is not « ENVOYER » (SEND) — the deterministic guard.
 *
 * Journal from 26/07/2026: « Rédige un email de remerciement à … » (Draft a thank-you email
 * to …) and a small model calls `gmail__send_email` on the spot. In `standard` confirmation
 * mode no card opens until the conversation has touched the web — the email WAS LEAVING.
 *
 * The system prompt already says so, but a prompt is a prayer, not a guarantee: a
 * send is irreversible, so the loop refuses it ITSELF, whatever the confirmation
 * mode. The guard is deliberately narrow both ways — it only acts
 * on SEND tools, and only when the request carries a DRAFTING verb with no
 * send verb. « Envoie un email… » (Send an email…) goes through.
 */
const SEND_TOOL = /(^|_)(send|post|reply|forward)_(email|mail|message|messages|dm|sms)\b|(^|_)send_(email|mail|message)$/i;

export function isSendTool(name: string): boolean {
  return SEND_TOOL.test(name.replace(/^[a-z0-9-]+__/i, ""));
}

/** DRAFTING verbs (produce a text) and SEND verbs (make it leave). */
// ⚠️ Boundaries via Unicode lookaround, never `\b`: `\b` is ASCII, so « Écris » at
// the start of a sentence opened no boundary and the guard never triggered.
// Shared definition: `send/wordEdges.ts` (rule 9).
import { EDGE_L, EDGE_R } from "../send/wordEdges";
const DRAFT_VERB = new RegExp(
  `${EDGE_L}(r[ée]dige|r[ée]diger|[ée]cris|[ée]crire|pr[ée]pare|pr[ée]parer|compose|composer|` +
    `propose|proposer|formule|formuler|draft|write)${EDGE_R}`,
  "iu",
);
const SEND_VERB = new RegExp(
  `${EDGE_L}(envoie|envoie-le|envoyer|envoi|transmets|transmettre|exp[ée]die|exp[ée]dier|` +
    `poste|poster|send|deliver)${EDGE_R}`,
  "iu",
);

/**
 * An explicit PROHIBITION on sending. It contains the send verb, which turned
 * the guard against its own target: « N'envoie rien : montre-moi d'abord. » contained « envoie »,
 * so the request read as a send order — and the email went out (journal from
 * 27/07/2026). The negation is therefore handled FIRST, and it is SUFFICIENT: saying « n'envoie
 * rien » requires no drafting verb at all to be honored.
 */
const NO_SEND = new RegExp(
  `${EDGE_L}(?:n['’ ]?(?:e[ ]?)?(?:les[ ]?|le[ ]?|lui[ ]?)?envoie|n['’ ]?envoyez|ne[ ](?:rien[ ])?envoyer|` +
    `sans[ ](?:rien[ ])?envoyer|pas[ ]d['’]envoi|ne[ ]pas[ ]envoyer|` +
    `do[ ]?n['’]?t[ ]send|do[ ]not[ ]send|without[ ]sending)`,
  "iu",
);

/**
 * Does the request call for a DRAFT rather than a send?
 *
 * Three cases, in this order — the order IS the rule:
 *  1. an explicit prohibition on sending ⇒ yes, whatever else is in the message;
 *  2. otherwise, a send verb ⇒ no (over-blocking an explicit « envoie » would be as serious
 *     as letting a « rédige » go out);
 *  3. otherwise, a drafting verb ⇒ yes.
 */
export function asksDraftNotSend(text: string | undefined | null): boolean {
  if (!text) return false;
  if (NO_SEND.test(text)) return true;
  return DRAFT_VERB.test(text) && !SEND_VERB.test(text);
}

/** What the model receives instead of the send result: the instruction, not an error. */
export const DRAFT_NOT_SEND_STEER =
  "Envoi REFUSÉ : l'utilisateur a demandé de RÉDIGER, pas d'ENVOYER. L'e-mail n'est PAS " +
  "parti. Présente le texte rédigé dans la conversation (bloc document) et laisse " +
  "l'utilisateur décider de l'envoyer. Ne rappelle aucun outil d'envoi sans une demande " +
  "explicite (« envoie », « transmets »).";

