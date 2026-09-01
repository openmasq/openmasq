import { EDGE_L, EDGE_R } from "./wordEdges";

/**
 * "HEAVY" ≠ "LIGHT" — the Auto mode's intent vocabulary (`autoRoute.ts`), the multilingual
 * sister of `agent/readIntent.ts` / `agent/sendIntent.ts` and built on the
 * same principles: deterministic, local, and ORDER is the rule (heavy wins).
 *
 * ## The direction of false positives — the INVERSE asymmetry of `readIntent`
 *
 * Over-classing costs MONEY (a metered send for a trivial question, irreversible);
 * under-classing costs a middling reply (repairable: you ask again, and escalation on
 * failure is the intended follow-up). The HEAVY list is therefore MEASURED — every verb in it is
 * unambiguous in ALL six of its languages or it doesn't go in ("développe" was left out: FR
 * "développe ce point" = flesh out; "design": a logo is not an architecture;
 * "löse" DE: "ein Ticket lösen" = buy a ticket). The LIGHT list is a little
 * more generous: its false positive only costs a reply that has to be re-asked for.
 *
 * Languages covered: FR · EN · ES · DE · IT · PT. Unicode boundaries (`wordEdges.ts`),
 * never `\b`. Nothing recognised ⇒ neither heavy nor light: the unknown keeps the classing from
 * structural signals alone (volume, tools, images) — the vocabulary REFINES, it does not
 * replace.
 */

/** Verbs that call for REASONING or expert output — unambiguous. */
const HEAVY_VERB = new RegExp(
  `${EDGE_L}(?:` +
    // FR — imperative / infinitive / 2nd pl. all at once (`prouve[rz]?` → prouve/prouver/prouvez)
    `prouve[rz]?|d[ée]montre[rz]?|d[ée]bogue[rz]?|d[ée]bugge?[rz]?|` +
    `optimise[rz]?|refactor(?:e|ise)[rz]?|audite[rz]?|` +
    `con[çc]ois|concevoir|concevez|mod[ée]lise[rz]?|impl[ée]mente[rz]?|` +
    `n[ée]gocie[rz]?|[ée]labore[rz]?|r[ée]sous|r[ée]soudre|r[ée]solvez|` +
    // EN — with inflections ("help me debugging this" must count)
    `prove[sd]?|proving|debug(?:ging|ged|s)?|troubleshoot(?:ing|s)?|` +
    `optimi[sz](?:e[sd]?|ing|ation)|refactor(?:ing|ed|s)?|audit(?:ing|ed|s)?|` +
    `implement(?:ing|ed|s)?|negotiat(?:e[sd]?|ing|ion)|devise[sd]?|solv(?:e[sd]?|ing)|` +
    // ES (tú/usted/infinitive: demuestra/demuestre/demostrar)
    `demuestr[ae]|demostrar|depur[ae]|depurar|optimiz[ae]|optimizar|` +
    `refactoriz[ae]|refactorizar|audit[ae]|auditar|` +
    `implement[ae]|implementar|negoci[ae]|negociar|resuelv[ae]|resolver|elabor[ae]|elaborar|` +
    // DE (imperative/infinitive: beweise/beweisen)
    `beweisen?|debuggen?|optimieren?|refaktorieren?|auditieren?|implementieren?|verhandeln?|verhandle|` +
    // IT (tu/voi/infinitive: dimostra/dimostrate/dimostrare)
    `dimostra(?:re|te)?|debugga(?:re|te)?|ottimizza(?:re|te)?|rifattorizza(?:re|te)?|` +
    `implementa(?:re|te)?|negozia(?:re|te)?|risolv(?:i|ere|ete)|` +
    // PT (tu/você/infinitive: demonstra/demonstre/demonstrar)
    `demonstr[ae]|demonstrar|depur[ae]|depurar|otimiz[ae]|otimizar|` +
    `refator[ae]|refatorar|negoceia|resolv[ae]|resolver` +
    `)${EDGE_R}`,
  "iu",
);

/** DEBUGGING vocabulary — a noun from these families signals an expert task even with no
 *  verb ("why this segfault?"). Strong discriminants, no everyday-language word. */
const HEAVY_NOUN = new RegExp(
  `${EDGE_L}(?:bugs?|bogues?|stack[ -]?trace|segfault|deadlock|core[ ]dump)${EDGE_R}` +
    `|race[ ]condition|memory[ ]leak|fuite[ ]m[ée]moire`,
  "iu",
);

/** "In depth" phrases / causal analysis — the request SAYS it wants something heavy. */
const HEAVY_PHRASE = new RegExp(
  `en[ ]profondeur|in[ -]depth|en[ ]profundidad|in[ ]profondit[àa]|em[ ]profundidade|` +
    `root[ ]cause|cause[ ]racine|causa[ ]ra[íi]z|causa[ ]raiz`,
  "iu",
);

/** SEQUENCE connectors — a multi-step instruction is a heavy task.
 *  "puis"/"then" are too common alone: it takes ≥ 3 DISTINCT connectors
 *  ("je passe d'abord au bureau" must not cost credits), or a real
 *  numbered list (≥ 2 `1.`/`2)` items). */
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

/** Surface TRANSFORMATION verbs — translate, summarise, rephrase: a small
 *  model serves them very well. Bare "resume" is Spanish ONLY in front of a determiner
 *  (otherwise it's the English CV/resume); "corrige" is light ONLY with a
 *  spelling object ("corrige ce bug" stays heavy, caught by HEAVY_NOUN). */
const LIGHT_VERB = new RegExp(
  `${EDGE_L}(?:` +
    // Accented "résumé" is free; bare "resume" only in front of an FR/ES determiner —
    // otherwise it's English ("the CV", "resume the meeting"). resumer/resumez stay
    // free (no English word ends that way): the accent-less keyboard keeps its form.
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
    // DE with a separated particle: "fasse … zusammen" (the verb splits in two)
    `|fass(?:e|t|en)?[^.!?\\n]{0,60}${EDGE_L}zusammen${EDGE_R}`,
  "iu",
);

/** Spelling proofread: correction verb + spelling object, TOGETHER —
 *  "corrige" alone is ambiguous (a bug also gets "corrigé"). */
const FIX_VERB = new RegExp(
  `${EDGE_L}(?:corrige[rz]?|fix|correct|corrig[ei]|corregg[ei]|corrija|korrigiere?n?|arregl[ae])${EDGE_R}`,
  "iu",
);
const SPELL_NOUN = new RegExp(
  `${EDGE_L}(?:orthographe|grammaire|fautes?|coquilles?|typos?|spelling|grammar|` +
    `ortograf[íi]a|gram[áa]tica|Rechtschreibung|Grammatik|ortografia|grammatica|gralhas?)${EDGE_R}`,
  "iu",
);

/** Is the request a MULTI-STEP instruction? A numbered list (≥ 2 items) or
 *  ≥ 3 DISTINCT sequence connectors. A LIGHT lead defuses it ("translate:
 *  1. … 2. …" — the numbers are the CONTENT to translate, not steps). */
export function isMultiStepAsk(text: string): boolean {
  if (LIGHT_VERB.test(text.slice(0, 48))) return false;
  const numbered = text.match(NUMBERED_ITEM);
  if (numbered && numbered.length >= 2) return true;
  const seen = new Set<string>();
  for (const m of text.matchAll(SEQUENCE)) seen.add(m[0].toLowerCase().replace(/\s+/g, " "));
  return seen.size >= 3;
}

/** The request CARRIES heaviness: expert verb, debugging vocabulary, "en profondeur",
 *  or a multi-step instruction. `classifyAutoTask` then classes it `expert`. */
export function hardTaskAsk(text: string | undefined | null): boolean {
  if (!text) return false;
  return (
    HEAVY_VERB.test(text) || HEAVY_NOUN.test(text) || HEAVY_PHRASE.test(text) || isMultiStepAsk(text)
  );
}

/** The request is only a surface TRANSFORMATION — and nothing heavy alongside it:
 *  heavy always wins ("traduis puis optimise ce code" is not light). */
export function lightTaskAsk(text: string | undefined | null): boolean {
  if (!text || hardTaskAsk(text)) return false;
  return LIGHT_VERB.test(text) || (FIX_VERB.test(text) && SPELL_NOUN.test(text));
}
