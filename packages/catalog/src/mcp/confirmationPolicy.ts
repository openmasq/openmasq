import type { WriteRisk } from "./writeRisk";

/**
 * LA politique de confirmation d'action — le SEUL endroit qui décide QUAND une
 * confirmation apparaît et SUR QUELLE surface. Main (la fenêtre non-spoofable) et le
 * renderer (la carte inline) évaluent la MÊME liste (rule 9) : modifier une règle ici
 * change le comportement partout, sans toucher un call site.
 *
 * Le modèle : par mode, une liste ordonnée de règles ; la PREMIÈRE dont toutes les
 * conditions tiennent décide la surface. Aucune règle ne matche ⇒ pas de confirmation.
 * Les conditions lisent des FAITS mesurés par l'appelant (le loop / main) — la politique
 * ne re-dérive rien.
 *
 * ⚠️ RÈGLE 7 — ce que ce fichier est, et n'est pas. La politique décrit une UX de
 * confirmation, pas la frontière de sécurité entière : les gates qui ne sont PAS des
 * confirmations (allow-list de domaines, scan d'exfil, SSRF, redaction) restent
 * inconditionnels et ne passent jamais par ici. Deux invariants à préserver en
 * l'éditant :
 *   - Les planchers `exfil` / `attachments` / `send` ouvrent TOUJOURS une carte, dans
 *     les deux modes — un signal d'exfiltration, un fichier qui part en clair ou un
 *     envoi ne se débouncent pas « une fois par conversation », et une règle `floor`
 *     n'est exemptable par AUCUNE allow-list (voir `ConfirmationRule.floor`).
 *   - Une condition illisible (op inconnu) MATCHE : l'évaluateur sur-confirme, il ne
 *     sous-confirme jamais.
 *
 * ⚠️ RÉSIDUEL ACCEPTÉ (décision produit) : en mode `standard` la fenêtre système
 * n'apparaît JAMAIS — un write ordinaire part sans confirmation tant que la
 * conversation n'a pas touché le web, et une seule carte est posée ensuite. La
 * confirmation systématique est l'opt-in « Mode renforcé » (Réglages), dont la
 * désactivation est confirmée sur la fenêtre non-spoofable pour qu'un XSS renderer ne
 * puisse pas rétrograder la posture à la place de l'utilisateur.
 */

export type ConfirmationMode = "standard" | "renforce";

/**
 * L'ORDRE des modes — plus haut = plus confirmant. C'est ce qui rend une politique
 * d'organisation COMPOSABLE : l'org pose un PLANCHER, le membre ne peut que resserrer.
 *
 * L'asymétrie est la même que celle du fichier main (`confirmationMode.ts`) : monter est
 * libre, descendre se confirme. Un plancher ne fait qu'ajouter une borne basse.
 */
const MODE_RANK: Record<ConfirmationMode, number> = { standard: 0, renforce: 1 };

/** `null`/inconnu ⇒ `null` (pas de plancher), jamais un mode inventé. */
export function parseConfirmationMode(value: unknown): ConfirmationMode | null {
  return value === "standard" || value === "renforce" ? value : null;
}

/**
 * Le mode effectif = le plus strict du plancher de l'org et du choix du membre.
 *
 * ⚠️ Pourquoi c'est sûr même si le plancher vient d'une source non vérifiée (le renderer
 * pousse le profil d'org à main) : la composition prend le MAXIMUM, donc un plancher
 * falsifié ne peut que rendre l'app PLUS confirmante. Un plancher ne peut jamais relâcher
 * quoi que ce soit — c'est ce qui permet de l'accepter sans preuve d'authenticité.
 */
export function composeConfirmationMode(
  orgFloor: ConfirmationMode | null | undefined,
  user: ConfirmationMode,
): ConfirmationMode {
  if (!orgFloor) return user;
  return MODE_RANK[orgFloor] >= MODE_RANK[user] ? orgFloor : user;
}

/** Le membre peut-il encore choisir ? Faux quand le plancher est déjà au maximum — la
 *  case des réglages se verrouille alors, avec la raison, plutôt que de mentir. */
export function confirmationModeLocked(orgFloor: ConfirmationMode | null | undefined): boolean {
  return orgFloor === "renforce";
}

/** Où la confirmation se joue. `inline` = la carte dans la conversation (renderer, UX) ;
 *  `system-modal` = la fenêtre main non-spoofable (la frontière). */
export type ConfirmationSurface = "inline" | "system-modal";

/**
 * Les faits qu'une condition peut lire. Numériques absents ⇒ 0 : main, qui ne connaît ni
 * les compteurs de conversation ni les signaux du loop, évalue avec son seul `risk` et
 * obtient exactement la part de la politique qui le concerne (les règles `system-modal`).
 */
export interface ConfirmationFacts {
  /** Verdict de `writeRisk` sur CE call (main le juge sur sa propre vue). */
  risk: WriteRisk;
  /** Recherches internet déjà parties dans CETTE conversation (tour courant inclus). */
  searchToolCalls?: number;
  /** Signaux d'exfiltration levés par le scan du loop sur les args de CE call. */
  exfilFlags?: number;
  /** Fichiers que CE call joindrait (ils partent en clair). */
  attachments?: number;
  /** CE call fait PARTIR quelque chose vers un tiers (e-mail, message) : 1, sinon 0.
   *  Un envoi ne se rattrape pas — pas de brouillon à supprimer, pas d'annulation. C'est
   *  ce qui lui vaut un PLANCHER en mode `standard`, au même titre que l'exfiltration et
   *  les pièces jointes : le mode allège les confirmations, il ne supprime pas celles qui
   *  portent sur l'irréversible. (Journal du 27/07/2026 : « N'envoie rien » et l'e-mail
   *  est parti sans qu'aucune carte ne s'ouvre.) */
  sends?: number;
  /** Confirmations déjà montrées dans CETTE conversation (pour `maxPerConversation`). */
  confirmationsShown?: number;
}

type NumericFact = Exclude<keyof ConfirmationFacts, "risk">;

export interface ConfirmationCondition {
  fact: keyof ConfirmationFacts;
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
  value: number | WriteRisk;
}

export interface ConfirmationRule {
  /** Identifiant stable — les tests et l'appelant s'y réfèrent, jamais à l'index. */
  id: string;
  surface: ConfirmationSurface;
  /** Toutes les conditions doivent tenir (ET). Vide = toujours. */
  when: ConfirmationCondition[];
  /** La règle ne tire plus quand `confirmationsShown` atteint ce plafond. */
  maxPerConversation?: number;
  /**
   * PLANCHER : la confirmation que cette règle décide ne peut être exemptée par AUCUNE
   * allow-list utilisateur (« Autoriser » par conversation, « toujours pour cet outil »,
   * auto-approbation de session). Un plancher porte sur l'irréversible — exfiltration,
   * pièce jointe, envoi — et « vous avez déjà confirmé » n'y est pas un consentement :
   * le DEUXIÈME envoi se confirme aussi. Une règle sans `floor` reste exemptable.
   */
  floor?: boolean;
}

/**
 * La politique elle-même — un littéral déclaratif, lisible comme du JSON.
 *
 * `standard` (défaut) : jamais de fenêtre système. Une SEULE carte par conversation,
 * et seulement une fois la conversation exposée à du contenu web (le vecteur
 * d'injection de prompt) — plus les TROIS planchers de sécurité, non plafonnés :
 * exfiltration, pièces jointes, et tout ce qui PART (un envoi ne s'annule pas).
 *
 * `renforce` (opt-in Réglages) : le comportement historique — fenêtre système pour un
 * write risqué (`writeRisk === "high"`), carte inline pour tout le reste.
 */
export const CONFIRMATION_POLICY: Record<ConfirmationMode, ConfirmationRule[]> = {
  standard: [
    { id: "exfil-floor", surface: "inline", floor: true, when: [{ fact: "exfilFlags", op: "gt", value: 0 }] },
    { id: "attachments-floor", surface: "inline", floor: true, when: [{ fact: "attachments", op: "gt", value: 0 }] },
    // Plancher, donc SANS `maxPerConversation` : chaque envoi se confirme, y compris le
    // deuxième. Un « vous avez déjà confirmé un envoi » n'est pas un consentement.
    { id: "send-floor", surface: "inline", floor: true, when: [{ fact: "sends", op: "gt", value: 0 }] },
    {
      id: "post-search-once",
      surface: "inline",
      when: [{ fact: "searchToolCalls", op: "gt", value: 0 }],
      maxPerConversation: 1,
    },
  ],
  renforce: [
    { id: "exfil", surface: "inline", floor: true, when: [{ fact: "exfilFlags", op: "gt", value: 0 }] },
    { id: "attachments", surface: "inline", floor: true, when: [{ fact: "attachments", op: "gt", value: 0 }] },
    { id: "risky-system", surface: "system-modal", when: [{ fact: "risk", op: "eq", value: "high" }] },
    // Le mode renforcé ne peut pas être MOINS confirmant que standard : sans ce plancher,
    // un envoi ordinaire matcherait `every-write` (exemptable) et un « Autoriser » ferait
    // partir le deuxième e-mail sans carte — ce que standard, lui, refuse. Placé APRÈS
    // `risky-system` : un envoi risqué garde la fenêtre système (main gate de son côté).
    { id: "send-floor", surface: "inline", floor: true, when: [{ fact: "sends", op: "gt", value: 0 }] },
    { id: "every-write", surface: "inline", when: [] },
  ],
};

function factValue(facts: ConfirmationFacts, fact: keyof ConfirmationFacts): number | WriteRisk {
  if (fact === "risk") return facts.risk;
  return facts[fact as NumericFact] ?? 0;
}

function holds(c: ConfirmationCondition, facts: ConfirmationFacts): boolean {
  const v = factValue(facts, c.fact);
  switch (c.op) {
    case "eq":
      return v === c.value;
    case "neq":
      return v !== c.value;
    case "gt":
      return typeof v === "number" && typeof c.value === "number" && v > c.value;
    case "gte":
      return typeof v === "number" && typeof c.value === "number" && v >= c.value;
    case "lt":
      return typeof v === "number" && typeof c.value === "number" && v < c.value;
    case "lte":
      return typeof v === "number" && typeof c.value === "number" && v <= c.value;
    default:
      // Op inconnu (une édition future mal typée passée en force) : la condition MATCHE,
      // donc la règle tire — on sur-confirme, on ne sous-confirme jamais (rule 7).
      return true;
  }
}

/**
 * Évalue la politique pour un call d'écriture : la première règle du mode dont toutes
 * les conditions tiennent (et dont le plafond par conversation n'est pas atteint), ou
 * `null` = aucune confirmation requise. Un mode inconnu évalue `renforce` (fail closed :
 * la posture la plus confirmante).
 */
export function confirmationSurface(
  mode: ConfirmationMode,
  facts: ConfirmationFacts,
): ConfirmationRule | null {
  const rules = CONFIRMATION_POLICY[mode] ?? CONFIRMATION_POLICY.renforce;
  for (const rule of rules) {
    if (
      rule.maxPerConversation !== undefined &&
      (facts.confirmationsShown ?? 0) >= rule.maxPerConversation
    )
      continue;
    if (rule.when.every((c) => holds(c, facts))) return rule;
  }
  return null;
}
