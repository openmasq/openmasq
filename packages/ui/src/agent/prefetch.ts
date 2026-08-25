import type { ChatMessage, ToolCall } from "@openmasq/llm";
import { analyzeArgExfil } from "../state/browserPolicy";
import { isConfidentReadOnly, maxSameToolCalls } from "./mcpAgentClassify";

/**
 * **Ce qui borne un batch de LECTURES, et pourquoi ce n'est pas leur nombre.**
 *
 * Dépouiller une boîte mail, c'est une recherche puis N lectures, et N vaut ce que vaut
 * la boîte. Les plafonds par outil (`maxSameToolCalls`) comptent des APPELS, ce qui est
 * un mauvais proxy : vingt en-têtes tiennent dans la fenêtre du modèle, vingt pièces
 * jointes non. Relever le plafond de lecture sans mesurer le VOLUME échangerait un tour
 * coupé au milieu contre un « context length exceeded » — qui coûte le tour ENTIER au
 * lieu de sa fin.
 *
 * Les trois pièces tiennent ensemble et vivent donc au même endroit (règle 10) : le
 * budget, la mesure, et le dispatch par vagues qui rend la mesure opérante.
 */

/** ≈4 caractères par token, et la MOITIÉ de la fenêtre au plus pour les résultats : le
 *  reste porte le prompt système, les schémas d'outils (le gros du tour) et la réponse. */
export function resultCharBudget(contextTokens: number | undefined): number {
  return Math.round((contextTokens ?? 128_000) * 4 * 0.5);
}

/** Ce que les résultats d'outils occupent DÉJÀ. Relu depuis l'historique plutôt que tenu
 *  dans un compteur : une quinzaine d'endroits poussent un résultat, et un compteur en
 *  oublie toujours un. */
export function toolResultChars(messages: readonly ChatMessage[]): number {
  let n = 0;
  for (const m of messages) if (m.role === "tool") n += m.content.length;
  return n;
}

/** Taille approximative d'un résultat d'outil BRUT — la mesure du budget.
 *  ⚠️ PAS `safeJson`, qui tronque à 400 caractères pour le journal : mesurer avec lui
 *  rend le budget aveugle (tout résultat pèse 400) et donc inopérant. */
export function approxResultChars(v: unknown): number {
  try {
    return JSON.stringify(v ?? {}).length;
  } catch {
    return 0;
  }
}

/** Lectures lancées ensemble avant de re-mesurer le volume. */
const PREFETCH_WAVE = 10;

/**
 * Lance les lectures PAR VAGUES — et c'est ce qui rend le budget opérant. Le batch
 * entier lancé d'un bloc décide à vide : rien n'est encore revenu quand il faut juger du
 * volume, si bien qu'un tour peut engager vingt lectures énormes puis mourir en 400. Une
 * vague borne ce qui est déjà engagé sans rien sérialiser à l'INTÉRIEUR d'elle : vingt
 * lectures restent deux vagues parallèles et UN seul aller-retour de chat.
 *
 * `dispatch` doit ENREGISTRER la promesse là où la boucle l'attendra ensuite — les appels
 * d'une vague partie sont consommés normalement ; seuls ceux des vagues NON parties
 * tomberont sur le refus par budget côté boucle.
 */
export async function dispatchInWaves<C, R>(opts: {
  calls: readonly C[];
  dispatch: (call: C) => Promise<R>;
  budget: number;
  /** Volume déjà présent dans l'historique, relu à chaque vague. */
  used: () => number;
  wave?: number;
}): Promise<void> {
  const size = opts.wave ?? PREFETCH_WAVE;
  let engaged = 0; // revenu du prefetch, pas encore dans l'historique
  for (let i = 0; i < opts.calls.length; i += size) {
    if (opts.used() + engaged >= opts.budget) return;
    const settled = await Promise.allSettled(opts.calls.slice(i, i + size).map(opts.dispatch));
    for (const r of settled) if (r.status === "fulfilled") engaged += approxResultChars(r.value);
  }
}

/** Le résultat renvoyé quand les résultats CUMULÉS du tour ont mangé la part de fenêtre
 *  qui leur revient — l'appel n'est PAS dispatché, et le modèle est sommé de conclure
 *  avec ce qu'il a plutôt que de voir son tour avorter. */
export function contextBudgetNote(tool: string): string {
  return (
    `Volume de résultats maximal atteint pour ce tour : l'appel à \`${tool}\` n'a PAS été exécuté ` +
    `(la suite ne tiendrait plus dans ta fenêtre de contexte). N'appelle PLUS d'outil — réponds ` +
    `MAINTENANT avec ce que tu as déjà lu, en signalant ce qui n'a pas pu être consulté.`
  );
}

/**
 * **Quelles lectures d'UN tour partent en parallèle, et jusqu'où.**
 *
 * Les appels d'un même tour sont INDÉPENDANTS par construction — le modèle les a émis
 * avant de voir le moindre résultat, donc une lecture ne peut pas dépendre de la sortie
 * d'une autre (une vraie dépendance lecture→lecture est toujours à cheval sur deux
 * tours). Paralléliser le réseau est donc sûr : le redaction des résultats reste
 * sérialisé par le mutex du coffre, et le traitement par résultat reste séquentiel dans
 * la boucle, qui ne fait qu'ATTENDRE la promesse déjà partie.
 *
 * Ne partent que les lectures dont on est CONFIANT (`isConfidentReadOnly`) : une
 * écriture, un méta-outil, un outil d'intention inconnue (une mutation mal classée comme
 * `execute_sql`) et un appel aux arguments malformés passent en direct et dans l'ordre
 * par la boucle, pour qu'aucun effet de bord ne précède la porte d'écriture.
 */
export async function prefetchReads(o: {
  calls: readonly ToolCall[];
  /** Appels DÉJÀ exécutés ce tour, par outil — le plafond se projette dessus. */
  callCounts: ReadonlyMap<string, number>;
  toolInfo: ReadonlyMap<string, { annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }>;
  /** Les termes du coffre, pour le scan d'exfiltration d'arguments. */
  vaultTerms: string[];
  /** Un-redaction des arguments, tel que le vrai serveur les recevra. */
  deredact: (args: Record<string, unknown>) => Record<string, unknown>;
  /** Lance l'appel ET enregistre sa promesse là où la boucle l'attendra. */
  dispatch: (call: ToolCall) => Promise<unknown>;
  budget: number;
  used: () => number;
}): Promise<void> {
  const seen = new Set<string>();
  const projected = new Map<string, number>();
  const eligible: ToolCall[] = [];
  for (const call of o.calls) {
    if (call.argsError) continue;
    // Dédup intra-tour, côté prefetch : un jumeau identique ne doit pas être DISPATCHÉ
    // ici non plus (la dédup de la boucle séquentielle s'exécute après le tir).
    const dupKey = `${call.name}::${JSON.stringify(call.arguments ?? {})}`;
    if (seen.has(dupKey)) continue;
    seen.add(dupKey);
    // Au-delà du plafond par outil la boucle séquentielle REFUSE sans dispatcher — le
    // prefetch ne doit donc pas l'avoir déjà envoyé au serveur.
    const n = (projected.get(call.name) ?? 0) + 1;
    projected.set(call.name, n);
    const readOnly = isConfidentReadOnly(call.name, o.toolInfo.get(call.name));
    if (!readOnly) continue;
    if ((o.callCounts.get(call.name) ?? 0) + n > maxSameToolCalls(call.name, readOnly)) continue;
    // H-4 (deuxième passe) : la porte écriture / exfil-d'arguments s'exécute dans la
    // boucle séquentielle, mais un appel pré-chargé part ICI — arguments un-redacted,
    // vrai serveur atteint, AVANT cette porte. Un `attacker__lookup(note="…vraie PII…")`
    // injecté fuirait donc avant qu'`analyzeArgExfil` ne le voie. On refait le MÊME
    // contrôle maintenant ; si c'est suspect, pas de prefetch — l'appel retombe sur le
    // chemin séquentiel gardé, où la confirmation montre les vraies valeurs.
    if (analyzeArgExfil(o.deredact((call.arguments ?? {}) as Record<string, unknown>), o.vaultTerms).suspicious)
      continue;
    eligible.push(call);
  }
  await dispatchInWaves({
    calls: eligible,
    dispatch: o.dispatch,
    budget: o.budget,
    used: o.used,
  });
}
