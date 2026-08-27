import {
  contextWindow,
  isFreeModel,
  modelMeta,
  supportsTools,
  type ModelInfo,
} from "@openmasq/llm";
import type { OrgProfileInfo, CreditBalance, BillingSubscription } from "../host";
import { hardTaskAsk, lightTaskAsk } from "./autoTaskIntent";
import { modelUnavailableReason } from "./modelAvailability";
import { resolveEffectivePlatform } from "./routing";

/**
 * Le mode AUTO : `conversation.modelId` peut valoir ce sentinel au lieu d'un id de
 * modèle réel — le modèle est alors CHOISI à chaque envoi, ici, déterministiquement.
 *
 * Deux invariants, tous deux côté sûr :
 * - **Jamais un modèle que la barrière d'envoi refuserait.** Les candidats passent par
 *   `modelUnavailableReason` — le MÊME helper que `preflightError` et le sélecteur
 *   (règle 9) — donc l'escalade vers un modèle métré (passerelle plateforme, crédits) n'est
 *   possible QUE si l'abonnement/le budget la couvre déjà. Un compte gratuit sans clé
 *   ne voit le routeur choisir qu'entre les `:free`.
 * - **La décision est LOCALE et déterministe.** Aucun appel réseau, aucun modèle : des
 *   signaux calculés sur la machine (longueur, pièces jointes, connecteurs actifs) et le
 *   positionnement relatif de `modelMeta` (famille/palier, pas des benchmarks inventés).
 *
 * `preflightError` revérifie l'élu à l'envoi comme n'importe quel choix manuel — le
 * routeur est une préférence, jamais une autorisation.
 */
export const AUTO_MODEL_ID = "auto";
export const AUTO_MODEL_LABEL = "Auto";

export function isAutoModelId(id: string | undefined | null): boolean {
  return id === AUTO_MODEL_ID;
}

/** La classe de tâche que le routeur a reconnue — trois paliers, pas plus : chaque
 *  palier de plus rend la décision moins explicable à l'utilisateur. */
export type AutoTaskClass = "leger" | "standard" | "expert";

/** Comment l'envoi routé sera FACTURÉ — c'est ce que l'UI doit rendre explicite :
 *  `metered` = passerelle plateforme, décompté des crédits d'abonnement. */
export type AutoBilling = "free" | "byo" | "metered";

export interface AutoRouteSignals {
  /** Le texte utilisateur de CET envoi (lu localement — rien ne part d'ici). */
  text: string;
  /** Taille cumulée des documents joints (caractères extraits). */
  attachmentChars: number;
  /** Des pages/images partent avec l'envoi ⇒ un modèle `vision` est requis. */
  hasImages: boolean;
  /** L'envoi entrera dans la boucle agentique (connecteurs MCP branchés + host capable). */
  usesConnectors: boolean;
  /** Le code interpreter est forcé pour cet envoi (tag « graphique »). */
  forcesCode?: boolean;
  /** Le dernier message ne demande qu'à CONSULTER (`agent/readIntent.ts`) — passé en
   *  booléen pour garder ce module découplé de `agent/`. */
  consultOnly?: boolean;
}

/** Les entrées de disponibilité — exactement celles de `modelUnavailableReason`, passées
 *  telles quelles pour que le routeur ne puisse pas router autrement que la barrière. */
export interface AutoRouteAvailability {
  billingMode: string | undefined;
  keyConfigured: ReadonlySet<string>;
  orgProfile: OrgProfileInfo | null;
  personalCredits: CreditBalance | null;
  personalSub?: BillingSubscription | null;
  openaiCompatBaseUrl: string;
  localEndpointReachable?: boolean | null;
  claudeCliReady?: boolean | null;
  codexCliReady?: boolean | null;
}

export interface AutoRouteResult {
  model: ModelInfo;
  taskClass: AutoTaskClass;
  billing: AutoBilling;
}

/** Marge de génération réservée au-delà de l'entrée estimée (tokens). */
const REPLY_HEADROOM_TOKENS = 2000;
/** Au-delà de ce volume d'entrée (texte + documents), la tâche est `expert`. */
const EXPERT_CHARS = 12_000;
/** En deçà (texte seul, sans outil ni pièce jointe), la tâche est `leger`. */
const LIGHT_CHARS = 280;
/** Une TRANSFORMATION de surface (`lightTaskAsk` : traduire, résumer…) reste légère
 *  au-delà de 280 caractères — jusqu'à ce plafond : le volume à transformer n'est pas
 *  de la difficulté, mais au-delà la fenêtre et la tenue du fil recomptent. */
const LIGHT_TASK_CHARS = 2_000;

/**
 * Classe de tâche, déterministe et explicable. L'ordre est la règle :
 * l'« expert » gagne sur le « léger » (un petit message qui force du code reste expert,
 * et le lexique LOURD gagne sur le léger — « traduis puis optimise » n'est pas léger).
 * Les signaux structurels décident d'abord ; le lexique (`autoTaskIntent.ts`,
 * FR·EN·ES·DE·IT·PT) AFFINE : un verbe expert (« prouve », « débogue »…) ou une
 * consigne multi-étapes classe expert ; un verbe de transformation classe léger.
 */
export function classifyAutoTask(s: AutoRouteSignals): AutoTaskClass {
  const totalChars = s.text.length + s.attachmentChars;
  const code = s.forcesCode || /```/.test(s.text);
  // Agir via des connecteurs demande un vrai tool-caller ; consulter est plus tolérant.
  const acts = s.usesConnectors && !s.consultOnly;
  if (code || acts || totalChars > EXPERT_CHARS || hardTaskAsk(s.text)) return "expert";
  const bare = !s.usesConnectors && !s.hasImages && s.attachmentChars === 0;
  const len = s.text.trim().length;
  if (bare && (len < LIGHT_CHARS || (len < LIGHT_TASK_CHARS && lightTaskAsk(s.text))))
    return "leger";
  return "standard";
}

/** Pondération du profil `modelMeta` (1–5 par axe) selon la classe. `cost` est déjà
 *  inversé côté meta (5 = économique), donc le poids joue TOUJOURS vers le moins cher —
 *  c'est ce qui évite de consommer des crédits pour une question triviale. */
const WEIGHTS: Record<AutoTaskClass, { reasoning: number; coding: number; speed: number; cost: number }> = {
  expert: { reasoning: 3, coding: 2, speed: 0, cost: 0 },
  standard: { reasoning: 2, coding: 1, speed: 1, cost: 1 },
  leger: { reasoning: 1, coding: 0, speed: 2, cost: 2 },
};

/** Un modèle MÉTRÉ (passerelle plateforme → crédits d'abonnement) doit MÉRITER son coût :
 *  pénalité forte sur une tâche légère (un `:free` suffisant ne doit jamais lui céder),
 *  nulle sur une tâche experte — c'est là que l'escalade est le comportement voulu.
 *  Le BYO n'est pas pénalisé : la clé est celle de l'utilisateur, son choix. */
const METERED_PENALTY: Record<AutoTaskClass, number> = { expert: 0, standard: 2, leger: 4 };

/** Comment l'envoi de ce modèle serait facturé, avec les mêmes entrées que le routage
 *  réel (`resolveEffectivePlatform`) — jamais recalculé autrement (règle 9). */
export function autoBillingFor(m: ModelInfo, a: AutoRouteAvailability): AutoBilling {
  if (isFreeModel(m.id)) return "free";
  return resolveEffectivePlatform(m.provider, m.id, a.billingMode, a.keyConfigured)
    ? "metered"
    : "byo";
}

/**
 * Choisit le modèle de CET envoi parmi `candidates` (la liste que le sélecteur
 * offrirait : `selectableModels(allowedModelIds)` — l'org-gouvernance est déjà dedans).
 *
 * `null` = aucun candidat envoyable (tout est indisponible) ; l'appelant retombe sur le
 * défaut et laisse `preflightError` produire le refus explicite habituel.
 */
export function resolveAutoModel(
  candidates: readonly ModelInfo[],
  signals: AutoRouteSignals,
  avail: AutoRouteAvailability,
): AutoRouteResult | null {
  const taskClass = classifyAutoTask(signals);
  const needTokens =
    Math.ceil((signals.text.length + signals.attachmentChars) / 4) + REPLY_HEADROOM_TOKENS;

  const usable = candidates.filter((m) => {
    // Contraintes DURES d'abord — chacune éliminatoire, aucune pondérable :
    // 1. la barrière d'envoi doit accepter (clé, crédits, abonnement, endpoint local) ;
    if (
      modelUnavailableReason({
        model: m,
        effectivePlatform: resolveEffectivePlatform(m.provider, m.id, avail.billingMode, avail.keyConfigured),
        orgProfile: avail.orgProfile,
        personalCredits: avail.personalCredits,
        personalSub: avail.personalSub,
        keyConfigured: avail.keyConfigured,
        openaiCompatBaseUrl: avail.openaiCompatBaseUrl,
        localEndpointReachable: avail.localEndpointReachable,
        claudeCliReady: avail.claudeCliReady,
        codexCliReady: avail.codexCliReady,
      }) !== null
    )
      return false;
    // 2. des images partent ⇒ vision obligatoire ;
    if (signals.hasImages && !m.vision) return false;
    // 3. la boucle agentique ⇒ function calling obligatoire ;
    if ((signals.usesConnectors || signals.forcesCode) && !supportsTools(m.id)) return false;
    // 4. l'entrée doit tenir dans la fenêtre, avec 50 % de marge (historique, schémas
    //    d'outils). Fenêtre INCONNUE (local) : on n'exclut pas — `historyWindow` ne
    //    tronque pas non plus sur une fenêtre inconnue, même politique.
    const ctx = contextWindow(m.id);
    if (ctx !== undefined && ctx < needTokens * 1.5) return false;
    return true;
  });
  if (usable.length === 0) return null;

  const w = WEIGHTS[taskClass];
  const score = (m: ModelInfo): number => {
    const p = modelMeta(m.id).profile;
    return (
      p.reasoning * w.reasoning +
      p.coding * w.coding +
      p.speed * w.speed +
      p.cost * w.cost +
      // Des images ⇒ la force multimodale compte, quel que soit le palier.
      (signals.hasImages ? p.multimodal * 2 : 0) -
      (autoBillingFor(m, avail) === "metered" ? METERED_PENALTY[taskClass] : 0)
    );
  };

  // Meilleur score gagne ; à ÉGALITÉ, un modèle qui ne coûte rien à l'utilisateur
  // (`free`) passe devant un métré/BYO, puis l'ordre du registre départage — le tri est
  // stable, donc le résultat est déterministe pour des entrées identiques.
  const billingRank = (m: ModelInfo): number => (autoBillingFor(m, avail) === "free" ? 0 : 1);
  const best = [...usable].sort(
    (a, b) => score(b) - score(a) || billingRank(a) - billingRank(b),
  )[0];

  return { model: best, taskClass, billing: autoBillingFor(best, avail) };
}

/**
 * La légende sous une réponse routée — l'EXPLICITE promis : quel modèle a été choisi et,
 * surtout, sur quel argent l'envoi est parti. « via votre abonnement » n'apparaît que
 * sur un envoi réellement métré, jamais par prudence rhétorique (règle 8 : le texte
 * in-app est une promesse au même titre que la doc).
 */
export function autoRouteCaption(billing: AutoBilling, modelName?: string): string {
  const name = modelName ?? "Modèle";
  switch (billing) {
    case "metered":
      return `${name} — choisi automatiquement · via votre abonnement (crédits)`;
    case "byo":
      return `${name} — choisi automatiquement · via votre clé API`;
    case "free":
      return `${name} — choisi automatiquement (modèle gratuit)`;
  }
}
