import type { Cat } from "./composerDetection";

// L'AVERTISSEMENT D'UTILITÉ — détecter que la RÉPONSE va dépendre d'une donnée redacted.
//
// Un faux préserve l'espèce (genre, pays, checksum…) mais pas tout : un âge calculé depuis
// une fausse date de naissance est faux, « que fait cette entreprise ? » interroge une
// entité que le modèle ne connaît pas, une distance entre deux lieux faux ne veut rien
// dire — et une DÉRIVATION n'est pas une clé de coffre : rien ne la restitue. Le risque est
// invisible par construction (le texte restitué est correct, seul le raisonnement est
// faux), donc il faut le dire AVANT l'envoi. Chiffré dans
// `packages/redact/bench/RAPPORT-risques-utilite-2026-07.md`.
//
// C'est la généralisation du motif `WebNavRedactOffer` (le gate de révélation avant une
// recherche web), avec les mêmes principes :
//  - DÉTERMINISTE — un motif de question + une catégorie détectée, jamais un modèle ;
//  - les DEUX conditions, ou rien : un motif sans donnée redacted de la catégorie n'est
//    qu'une question ordinaire, une donnée sans motif n'est qu'une donnée protégée. Un
//    avertissement qui parle trop apprend à cliquer sans lire (la leçon écrite du gate
//    d'écriture) ;
//  - il n'EMPÊCHE rien : la pastille informe et offre le geste « garder en clair » qui
//    existe déjà (`toggleKeep`) — le redaction par défaut ne bouge pas.

export type UtilityRiskKind = "age" | "world" | "geo";

export interface UtilityRisk {
  kind: UtilityRiskKind;
  /** Les catégories moteur dont dépend la réponse (pour cibler les valeurs à révéler). */
  cats: readonly string[];
  /** Ce que la pastille dit — la LIMITE, jamais une promesse. */
  message: string;
}

/** Motif de question par risque. Multilingue FR/EN, mots ENTIERS, insensible à la casse. */
const PATTERNS: Record<UtilityRiskKind, RegExp> = {
  // Un calcul sur une date : âge, ancienneté, délai écoulé/restant, éligibilité par âge.
  age: /\b(quel\s+[âa]ge|[âa]g[ée]e?s?\s+de\s+(?:moins|plus)|depuis\s+combien|dans\s+combien\s+de\s+(?:temps|jours|mois|ans)|combien\s+d['’]ann[ée]es|anciennet[ée]|majeur|mineur|retraite|how\s+old|years?\s+old|age\s+of|eligib\w*)\b/iu,
  // La connaissance du monde sur une entité : ce qu'elle EST, fait, vaut, qui la dirige.
  world:
    /\b(que\s+fait|qui\s+est\s+derri[èe]re|c['’]est\s+quoi\s+comme\s+(?:boite|bo[îi]te|entreprise|soci[ée]t[ée])|quel\s+secteur|convention\s+collective|concurrents?\s+de|what\s+does\s+\S+\s+do|who\s+owns|competitors?\s+of|industry\s+of)\b/iu,
  // La géographie dérivée : distance, trajet, proximité, même ville/région, météo locale.
  geo: /\b(distance|combien\s+de\s+(?:km|kilom[èe]tres)|temps\s+de\s+(?:trajet|route)|proche\s+de|pr[èe]s\s+de\s+chez|m[êe]me\s+(?:ville|r[ée]gion|d[ée]partement|quartier)|itin[ée]raire|how\s+far|close\s+to|same\s+(?:city|region|area)|route\s+to|commute)\b/iu,
};

/** Les catégories moteur qui portent chaque risque (clés FINES, `redactionCategory`). */
const RISK_CATS: Record<UtilityRiskKind, readonly string[]> = {
  age: ["dob", "date"],
  world: ["company"],
  geo: ["location", "address"],
};

const MESSAGES: Record<UtilityRiskKind, string> = {
  age: "La réponse dépend d'une date redacted — un âge ou un délai calculé peut être décalé.",
  world: "Le modèle ne connaît pas l'entreprise sous son nom d'emprunt — il ne peut rien savoir d'elle.",
  geo: "Distances et proximités sont calculées sur des lieux d'emprunt — le résultat ne veut rien dire.",
};

/**
 * Le risque d'utilité du brouillon, ou null. `detected` est la sortie des DEUX couches de
 * détection du composeur (`Cat.cat` = catégorie fine du moteur) — donc exactement ce qui
 * sera redacted à l'envoi, ni plus ni moins.
 *
 * Un seul risque à la fois, le premier par gravité (âge > monde > géo) : deux pastilles
 * seraient déjà du bruit.
 */
export function utilityRisk(text: string, detected: readonly Cat[]): UtilityRisk | null {
  if (!text.trim() || detected.length === 0) return null;
  const present = new Set(detected.map((d) => d.cat.toLowerCase()));
  for (const kind of ["age", "world", "geo"] as const) {
    if (!PATTERNS[kind].test(text)) continue;
    const cats = RISK_CATS[kind].filter((c) => present.has(c));
    if (cats.length === 0) continue; // motif sans donnée redacted → question ordinaire
    return { kind, cats, message: MESSAGES[kind] };
  }
  return null;
}

/** Les valeurs du brouillon que « Garder en clair » doit relâcher pour ce risque. */
export function riskValues(risk: UtilityRisk, detected: readonly Cat[]): string[] {
  const wanted = new Set(risk.cats);
  return [...new Set(detected.filter((d) => wanted.has(d.cat.toLowerCase())).map((d) => d.value))];
}

/** Le strict nécessaire d'une pièce jointe pour en tirer des catégories de risque. */
export interface RiskAttachment {
  replacements?: readonly { real: string; kind?: string }[];
  reveal?: readonly string[];
}

/**
 * Les catégories redacted portées par les PIÈCES JOINTES — même vocabulaire fin que
 * le composeur (`PdfReplacement.kind` = `Cat.cat`). Une date de naissance vit bien plus
 * souvent dans un bulletin ou un dossier que dans le brouillon tapé : sans cette source,
 * l'avertissement était aveugle au cas le plus fréquent (mesuré 15/08 : substitut né en
 * 1948 pour une patiente de 57 ans — réponse calibrée « personne âgée », sans un mot).
 * Une valeur déjà révélée (`reveal`) part en clair : plus un risque, donc exclue ici.
 */
export function attachmentCats(attachments: readonly RiskAttachment[]): Cat[] {
  return attachments.flatMap((a) => {
    const revealed = new Set(a.reveal ?? []);
    return (a.replacements ?? [])
      .filter((r) => r.kind && !revealed.has(r.real))
      .map((r) => ({ value: r.real, cat: r.kind as string }));
  });
}

/** Pièce adressable par le geste « garder en clair » (le canal `onRevealChange`). */
export interface RevealableAttachment extends RiskAttachment {
  cid: string;
}

/**
 * Ce que « Garder en clair » doit faire des valeurs d'un risque : les valeurs du
 * BROUILLON passent par le keep existant ; celles d'une PIÈCE JOINTE par la liste
 * `reveal` du fichier — le même geste que « Unredact » dans l'aperçu. Rendu sous
 * forme de plan (cid → nouvelle liste) pour rester pur et testable.
 */
export function revealPlan(
  values: readonly string[],
  attachments: readonly RevealableAttachment[],
): { cid: string; reveal: string[] }[] {
  const plan: { cid: string; reveal: string[] }[] = [];
  for (const a of attachments) {
    const mine = new Set((a.replacements ?? []).map((r) => r.real));
    const add = values.filter((v) => mine.has(v) && !(a.reveal ?? []).includes(v));
    if (add.length) plan.push({ cid: a.cid, reveal: [...(a.reveal ?? []), ...add] });
  }
  return plan;
}
