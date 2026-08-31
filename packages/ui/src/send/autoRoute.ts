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
import { subscriptionsSold } from "./platformAccess";

/**
 * AUTO mode: `conversation.modelId` can hold this sentinel instead of a real
 * model id — the model is then CHOSEN on every send, here, deterministically.
 *
 * Two invariants, both on the safe side:
 * - **Never a model the send gate would refuse.** Candidates go through
 *   `modelUnavailableReason` — the SAME helper as `preflightError` and the picker
 *   (rule 9) — so escalating to a metered model (platform gateway, credits) is
 *   possible ONLY if the subscription/budget already covers it. A free account with no key
 *   only ever sees the router choose among the `:free` models.
 * - **The decision is LOCAL and deterministic.** No network call, no model: it's
 *   signals computed on the machine (length, attachments, active connectors) and
 *   `modelMeta`'s relative positioning (family/tier, not invented benchmarks).
 *
 * `preflightError` re-checks the chosen one at send time like any manual choice — the
 * router is a preference, never an authorization.
 */
export const AUTO_MODEL_ID = "auto";
export const AUTO_MODEL_LABEL = "Auto";

export function isAutoModelId(id: string | undefined | null): boolean {
  return id === AUTO_MODEL_ID;
}

/** The task class the router recognised — three tiers, no more: every
 *  extra tier makes the decision less explainable to the user. */
export type AutoTaskClass = "leger" | "standard" | "expert";

/** How the routed send will be BILLED — this is what the UI must make explicit:
 *  `metered` = platform gateway, deducted from subscription credits. */
export type AutoBilling = "free" | "byo" | "metered";

export interface AutoRouteSignals {
  /** THIS send's user text (read locally — nothing leaves from here). */
  text: string;
  /** Cumulative size of the attached documents (extracted characters). */
  attachmentChars: number;
  /** Pages/images go out with the send ⇒ a `vision` model is required. */
  hasImages: boolean;
  /** The send will enter the agentic loop (MCP connectors connected + capable host). */
  usesConnectors: boolean;
  /** The code interpreter is forced for this send (the "graphique" tag). */
  forcesCode?: boolean;
  /** The last message only asks to CONSULT (`agent/readIntent.ts`) — passed as a
   *  boolean to keep this module decoupled from `agent/`. */
  consultOnly?: boolean;
}

/** The availability inputs — exactly those of `modelUnavailableReason`, passed
 *  as-is so the router can never route differently from the gate. */
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

/** Generation headroom reserved beyond the estimated input (tokens). */
const REPLY_HEADROOM_TOKENS = 2000;
/** Beyond this input volume (text + documents), the task is `expert`. */
const EXPERT_CHARS = 12_000;
/** Below this (text alone, no tool or attachment), the task is `leger`. */
const LIGHT_CHARS = 280;
/** A surface TRANSFORMATION (`lightTaskAsk`: translate, summarise…) stays light
 *  beyond 280 characters — up to this cap: the volume to transform is not
 *  the difficulty, but beyond it the window and thread continuity count again. */
const LIGHT_TASK_CHARS = 2_000;

/**
 * Task class, deterministic and explainable. Order is the rule:
 * "expert" beats "light" (a small message that forces code stays expert,
 * and HEAVY vocabulary beats light — "translate then optimise" is not light).
 * Structural signals decide first; the vocabulary (`autoTaskIntent.ts`,
 * FR·EN·ES·DE·IT·PT) REFINES: an expert verb ("prove", "debug"…) or a
 * multi-step instruction classes as expert; a transformation verb classes as light.
 */
export function classifyAutoTask(s: AutoRouteSignals): AutoTaskClass {
  const totalChars = s.text.length + s.attachmentChars;
  const code = s.forcesCode || /```/.test(s.text);
  // Acting via connectors requires a real tool-caller; consulting is more tolerant.
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
      // « abonnement (crédits) » n'existe que dans un build qui vend ; sinon l'envoi est
      // parti sur le compte de l'utilisateur, et c'est ce qu'on dit.
      return subscriptionsSold()
        ? `${name} — choisi automatiquement · via votre abonnement (crédits)`
        : `${name} — choisi automatiquement · inclus avec votre compte`;
    case "byo":
      return `${name} — choisi automatiquement · via votre clé API`;
    case "free":
      return `${name} — choisi automatiquement (modèle gratuit)`;
  }
}
