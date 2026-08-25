import { EDGE_L, EDGE_R } from "./wordEdges";

/**
 * « LOURD » ≠ « LÉGER » — le lexique d'intention du mode Auto (`autoRoute.ts`), sœur
 * multilingue de `agent/readIntent.ts` / `agent/sendIntent.ts` et construite sur les
 * mêmes principes : déterministe, locale, et l'ORDRE est la règle (le lourd gagne).
 *
 * ## Le sens des faux positifs — l'asymétrie INVERSE de `readIntent`
 *
 * Sur-classer coûte de l'ARGENT (un envoi métré pour une question triviale, irréversible) ;
 * sous-classer coûte une réponse moyenne (réparable : on redemande, et l'escalade sur
 * échec est la suite prévue). La liste LOURDE est donc MESURÉE — chaque verbe y est
 * inambigu dans SES six langues ou il n'y entre pas (« développe » est sorti : FR
 * « développe ce point » = étoffer ; « design » : un logo n'est pas une architecture ;
 * « löse » DE : « ein Ticket lösen » = acheter un billet). La liste LÉGÈRE est un peu
 * plus généreuse : son faux positif ne coûte qu'une réponse à re-demander.
 *
 * Langues couvertes : FR · EN · ES · DE · IT · PT. Frontières Unicode (`wordEdges.ts`),
 * jamais `\b`. Rien de reconnu ⇒ ni lourd ni léger : l'inconnu garde le classement par
 * les seuls signaux structurels (volume, outils, images) — le lexique AFFINE, il ne
 * remplace pas.
 */

/** Verbes qui demandent du RAISONNEMENT ou une production experte — inambigus. */
const HEAVY_VERB = new RegExp(
  `${EDGE_L}(?:` +
    // FR — impératif / infinitif / 2ᵉ pl. d'un coup (`prouve[rz]?` → prouve/prouver/prouvez)
    `prouve[rz]?|d[ée]montre[rz]?|d[ée]bogue[rz]?|d[ée]bugge?[rz]?|` +
    `optimise[rz]?|refactor(?:e|ise)[rz]?|audite[rz]?|` +
    `con[çc]ois|concevoir|concevez|mod[ée]lise[rz]?|impl[ée]mente[rz]?|` +
    `n[ée]gocie[rz]?|[ée]labore[rz]?|r[ée]sous|r[ée]soudre|r[ée]solvez|` +
    // EN — avec les flexions (« help me debugging this » doit compter)
    `prove[sd]?|proving|debug(?:ging|ged|s)?|troubleshoot(?:ing|s)?|` +
    `optimi[sz](?:e[sd]?|ing|ation)|refactor(?:ing|ed|s)?|audit(?:ing|ed|s)?|` +
    `implement(?:ing|ed|s)?|negotiat(?:e[sd]?|ing|ion)|devise[sd]?|solv(?:e[sd]?|ing)|` +
    // ES (tú/usted/infinitif : demuestra/demuestre/demostrar)
    `demuestr[ae]|demostrar|depur[ae]|depurar|optimiz[ae]|optimizar|` +
    `refactoriz[ae]|refactorizar|audit[ae]|auditar|` +
    `implement[ae]|implementar|negoci[ae]|negociar|resuelv[ae]|resolver|elabor[ae]|elaborar|` +
    // DE (impératif/infinitif : beweise/beweisen)
    `beweisen?|debuggen?|optimieren?|refaktorieren?|auditieren?|implementieren?|verhandeln?|verhandle|` +
    // IT (tu/voi/infinitif : dimostra/dimostrate/dimostrare)
    `dimostra(?:re|te)?|debugga(?:re|te)?|ottimizza(?:re|te)?|rifattorizza(?:re|te)?|` +
    `implementa(?:re|te)?|negozia(?:re|te)?|risolv(?:i|ere|ete)|` +
    // PT (tu/você/infinitif : demonstra/demonstre/demonstrar)
    `demonstr[ae]|demonstrar|depur[ae]|depurar|otimiz[ae]|otimizar|` +
    `refator[ae]|refatorar|negoceia|resolv[ae]|resolver` +
    `)${EDGE_R}`,
  "iu",
);

/** Vocabulaire de DÉBOGAGE — un nom de ces familles signe une tâche experte même sans
 *  verbe (« pourquoi ce segfault ? »). Discriminants forts, pas de mot du langage courant. */
const HEAVY_NOUN = new RegExp(
  `${EDGE_L}(?:bugs?|bogues?|stack[ -]?trace|segfault|deadlock|core[ ]dump)${EDGE_R}` +
    `|race[ ]condition|memory[ ]leak|fuite[ ]m[ée]moire`,
  "iu",
);

/** Locutions « en profondeur » / analyse causale — la demande DIT qu'elle veut du lourd. */
const HEAVY_PHRASE = new RegExp(
  `en[ ]profondeur|in[ -]depth|en[ ]profundidad|in[ ]profondit[àa]|em[ ]profundidade|` +
    `root[ ]cause|cause[ ]racine|causa[ ]ra[íi]z|causa[ ]raiz`,
  "iu",
);

/** Connecteurs de SÉQUENCE — une consigne en plusieurs étapes est une tâche lourde.
 *  « puis »/« then » sont trop communs seuls : il faut ≥ 3 connecteurs DISTINCTS
 *  (« je passe d'abord au bureau » ne doit pas coûter des crédits), ou une vraie
 *  liste numérotée (≥ 2 items `1.`/`2)`). */
const SEQUENCE = new RegExp(
  `${EDGE_L}(?:d['’]abord|puis|ensuite|enfin|` +
    `first|then|next|finally|afterwards|` +
    `primero|luego|despu[ée]s|finalmente|a[ ]continuaci[óo]n|` +
    `zuerst|dann|danach|anschlie[ßs]{1,2}end|schlie[ßs]{1,2}lich|` +
    `innanzitutto|poi|infine|` +
    `primeiro|depois|em[ ]seguida|por[ ]fim)${EDGE_R}`,
  "giu",
);
const NUMBERED_ITEM = /^\s*\d{1,2}[.)]\s+\S/gmu;

/** Verbes de TRANSFORMATION de surface — traduire, résumer, reformuler : un petit
 *  modèle les sert très bien. « resume » nu n'est espagnol QUE devant un déterminant
 *  (sinon c'est le CV/reprendre anglais) ; « corrige » n'est léger QU'avec un objet
 *  d'orthographe (« corrige ce bug » reste lourd, attrapé par HEAVY_NOUN). */
const LIGHT_VERB = new RegExp(
  `${EDGE_L}(?:` +
    // « résumé » accentué libre ; « resume » NU seulement devant un déterminant FR/ES —
    // sinon c'est l'anglais (le CV, « resume the meeting »). resumer/resumez restent
    // libres (aucun mot anglais ne finit ainsi) : le clavier sans accents garde sa forme.
    `traduis|traduire|traduisez|r[ée]sume[rz]|résume|r[ée]capitule[rz]?|reformule[rz]?|` +
    `resume(?=\\s+(?:ce|cette|ces|[çc]a|le|la|les|l['’]|moi|este|esta|esto|el|los|las))|` +
    `paraphrase[rz]?|raccourcis|raccourcir|raccourcissez|all[èe]ge[rz]?|[ée]pelle[rz]?|` +
    `translat(?:e[sd]?|ing|ion)|summari[sz](?:e[sd]?|ing)|rephras(?:e[sd]?|ing)|` +
    `reword(?:ing|ed)?|paraphras(?:e[sd]?|ing)|shorten(?:ing|ed)?|proofread(?:ing)?|tl;?dr|` +
    `traduce|traducir|traduzca|resuma|resumir|reformul[ae]|parafrase[ae]?|acort[ae]|` +
    `[üu]bersetzen?|zusammenfassung|zusammenfassen?|umformulieren?|k[üu]rzen?|` +
    `traduci|tradurre|traducete|riassum(?:i|ere|ete)|riformul[ai]|accorci[ao]|` +
    `traduz(?:a|ir)?|parafraseia|encurt[ae]` +
    `)${EDGE_R}` +
    // DE à particule séparée : « fasse … zusammen » (le verbe se coupe en deux)
    `|fass(?:e|t|en)?[^.!?\\n]{0,60}${EDGE_L}zusammen${EDGE_R}`,
  "iu",
);

/** Relecture orthographique : verbe de correction + objet d'orthographe, ENSEMBLE —
 *  « corrige » seul est ambigu (un bug se corrige aussi). */
const FIX_VERB = new RegExp(
  `${EDGE_L}(?:corrige[rz]?|fix|correct|corrig[ei]|corregg[ei]|corrija|korrigiere?n?|arregl[ae])${EDGE_R}`,
  "iu",
);
const SPELL_NOUN = new RegExp(
  `${EDGE_L}(?:orthographe|grammaire|fautes?|coquilles?|typos?|spelling|grammar|` +
    `ortograf[íi]a|gram[áa]tica|Rechtschreibung|Grammatik|ortografia|grammatica|gralhas?)${EDGE_R}`,
  "iu",
);

/** La demande est-elle une consigne MULTI-ÉTAPES ? Liste numérotée (≥ 2 items) ou
 *  ≥ 3 connecteurs de séquence DISTINCTS. Une tête LÉGÈRE désamorce (« traduis :
 *  1. … 2. … » — les numéros sont le CONTENU à traduire, pas des étapes). */
export function isMultiStepAsk(text: string): boolean {
  if (LIGHT_VERB.test(text.slice(0, 48))) return false;
  const numbered = text.match(NUMBERED_ITEM);
  if (numbered && numbered.length >= 2) return true;
  const seen = new Set<string>();
  for (const m of text.matchAll(SEQUENCE)) seen.add(m[0].toLowerCase().replace(/\s+/g, " "));
  return seen.size >= 3;
}

/** La demande PORTE le lourd : verbe expert, vocabulaire de débogage, « en profondeur »,
 *  ou consigne multi-étapes. `classifyAutoTask` la classe alors `expert`. */
export function hardTaskAsk(text: string | undefined | null): boolean {
  if (!text) return false;
  return (
    HEAVY_VERB.test(text) || HEAVY_NOUN.test(text) || HEAVY_PHRASE.test(text) || isMultiStepAsk(text)
  );
}

/** La demande n'est qu'une TRANSFORMATION de surface — et rien de lourd à côté :
 *  le lourd gagne toujours (« traduis puis optimise ce code » n'est pas léger). */
export function lightTaskAsk(text: string | undefined | null): boolean {
  if (!text || hardTaskAsk(text)) return false;
  return LIGHT_VERB.test(text) || (FIX_VERB.test(text) && SPELL_NOUN.test(text));
}
