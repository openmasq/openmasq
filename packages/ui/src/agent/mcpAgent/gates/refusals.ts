import { BRAND } from "@openmasq/branding";
import { safeJson } from "../../mcpAgentUtil";
import { MAX_CONSECUTIVE_DEAD } from "../budget";
import type { CallDecision, ConnectorCall, Step } from "../call";
import type { LoopCtx } from "../context";

const DRAFT_ONLY_MSG =
  "Envoi NON effectué : l'utilisateur a demandé de RÉDIGER ce message, pas de l'ENVOYER. " +
  "Présente le texte rédigé directement dans la conversation (bloc ```document pour un " +
  "e-mail/courrier complet) et attends : l'envoi n'aura lieu que si l'utilisateur le " +
  "demande explicitement (« envoie-le »). N'appelle plus d'outil d'envoi dans ce tour.";
const CONSULT_ONLY_MSG =
  "Action NON effectuée : l'utilisateur a demandé de CONSULTER, pas de MODIFIER. " +
  "Rien n'a été créé, modifié ni supprimé. Va chercher l'information avec les " +
  "outils de LECTURE du connecteur, puis réponds dans la conversation. Si une " +
  "écriture te semble nécessaire, PROPOSE-la en une phrase et attends une demande " +
  "explicite (« crée-le », « ajoute-le »). N'invente jamais de données à écrire.";
const DECLINED_MSG =
  "Action REFUSÉE par l'utilisateur : l'outil n'a PAS été exécuté. Ne relance pas " +
  "cette écriture sans nouvelle instruction ; propose une alternative ou demande à " +
  "l'utilisateur comment procéder.";
const ALREADY_DONE_MSG =
  "Cette action a DÉJÀ été effectuée lors d'une tentative précédente de ce tour — " +
  "elle n'a PAS été relancée (protection anti-doublon). Considère-la comme faite et " +
  "poursuis sans la répéter.";

/** The tool result for a call a deterministic gate refused, said by NAME: without a trace
 *  note the model paraphrases the refusal as the service's failure. */
function refuse(
  ctx: LoopCtx,
  c: ConnectorCall,
  content: string,
  journal: string,
  kind: Parameters<LoopCtx["gateBlocked"]>[0],
  note: string,
  countDead = true,
): Step {
  const { p } = ctx;
  ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: c.call.name, ok: false, args: safeJson(c.call.arguments), error: journal });
  ctx.gateBlocked(kind, c.bareTool, c.connectorId);
  p.onToolResult?.({ tool: c.bareTool, server: c.connectorId, ok: false, note });
  ctx.messages.push({ role: "tool", toolCallId: c.call.id, content });
  if (countDead && ctx.bumpDead() >= MAX_CONSECUTIVE_DEAD) return ctx.finishExhausted(), "stop";
  return "next";
}

/**
 * A call that will NOT be dispatched, in the loop's order of precedence. `null` = nothing
 * refused it: dispatch (or, with missing args, fall through to the common tail).
 */
export function refusalFor(ctx: LoopCtx, c: ConnectorCall, d: CallDecision): Step | null {
  const { p } = ctx;
  if (d.missing.length) return null;
  if (d.navFake) {
    const content =
      `Navigation REFUSÉE : le domaine « ${d.navFake.host} » semble construit à partir du ` +
      `pseudonyme de redaction « ${d.navFake.fake} » — ce n'est PAS le site réel (les données ` +
      `sensibles sont pseudonymisées avant que tu les voies). Ne devine JAMAIS une URL à partir ` +
      `d'un nom : fais une recherche web avec ce nom (la requête sera envoyée avec la vraie ` +
      `valeur) puis navigue vers le résultat.`;
    return refuse(ctx, c, content, `domaine dérivé d'un pseudonyme : ${d.navFake.host}`, "nav_pseudonym", `refusé par ${BRAND.name} — adresse dérivée d'un faux`);
  }
  if (d.navBlocked) {
    const content =
      `Navigation REFUSÉE : le domaine « ${d.navHost} » n'est pas dans la liste des domaines ` +
      `autorisés du navigateur. Navigue uniquement vers : ${p.browserAllowedDomains!.join(", ")}. ` +
      `N'essaie pas de contourner cette restriction.`;
    return refuse(ctx, c, content, `domaine non autorisé : ${d.navHost}`, "nav_domain", `refusé par ${BRAND.name} — domaine non autorisé`);
  }
  if (d.draftOnly)
    return refuse(ctx, c, DRAFT_ONLY_MSG, "rédaction demandée — envoi non sollicité, refusé", "draft_only", `refusé par ${BRAND.name} — rédaction demandée, pas d'envoi`);
  if (d.consultOnly)
    return refuse(ctx, c, CONSULT_ONLY_MSG, "consultation demandée — écriture non sollicitée, refusée", "consult_only", `refusé par ${BRAND.name} — demande lue comme une consultation`);
  if (d.declinedByUser) {
    // A declined write the model keeps retrying would otherwise spin until the turn cap.
    ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: c.call.name, ok: false, args: safeJson(c.call.arguments), error: "refusé par l'utilisateur" });
    ctx.gateBlocked("declined", c.bareTool, c.connectorId);
    p.onToolResult?.({ tool: c.bareTool, server: c.connectorId, ok: false, declined: true });
    ctx.messages.push({ role: "tool", toolCallId: c.call.id, content: DECLINED_MSG });
    if (ctx.bumpDead() >= MAX_CONSECUTIVE_DEAD) return ctx.finishExhausted(), "stop";
    return "next";
  }
  if (d.alreadyDone) {
    // A success, not a dead end: `deadStreak` is untouched.
    ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: c.call.name, ok: true, args: safeJson(c.call.arguments), result: "(déjà effectué — idempotent)" });
    ctx.gateBlocked("already_done", c.bareTool, c.connectorId);
    p.onToolResult?.({ tool: c.bareTool, server: c.connectorId, ok: true, note: "déjà effectué" });
    ctx.messages.push({ role: "tool", toolCallId: c.call.id, content: ALREADY_DONE_MSG });
    return "next";
  }
  return null;
}
