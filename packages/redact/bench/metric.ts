// Shared, dependency-free scoring for the redaction benchmarks. A "case" is a text plus its
// ground-truth (value, category) spans; a detector is any `(text) => detected value strings`.
// Recall is TOKEN-COVERAGE: a truth value counts as FOUND when ≥60% of its significant tokens
// appear in the union of the detected values (CJK is matched by separator-stripped substring,
// since CJK has no word tokens). This is deliberately value-based + lenient so it compares the
// regex engine, the local NER and the model detector on equal footing (all emit verbatim values).

export interface BenchCase {
  id: string;
  lang: string;
  text: string;
  truth: [value: string, category: string][];
}

export type Detector = (text: string) => string[] | Promise<string[]>;

const NAMEISH = new Set(["NAME", "CITY", "ORG"]);

/**
 * Donnée personnelle RÉELLE du texte, mais hors du périmètre que le plancher de rappel
 * mesure — comptée pour la PRÉCISION seulement, jamais pour le rappel.
 *
 * Elle existe parce qu'un corpus servait deux mesures qui se contredisent. Les planchers de
 * rappel (`*.recall.test.ts`) tournent sur le pipeline DÉTERMINISTE seul, sans modèle : c'est
 * ce qui les rend gratuits, hors ligne et stables. La vérité annotée avait donc été écrite à
 * la mesure de ce pipeline — d'où l'absence des établissements (l'école de l'élève, l'hôpital
 * du patient, l'université de l'étudiant), que seul le NER trouve.
 *
 * Conséquence mesurée avant l'ajout de cette catégorie : le produit redact correctement
 * « COLLÈGE JEAN-BAPTISTE CARPEAUX » sur le bulletin d'une mineure nommée, et la mesure de
 * précision comptait ce redaction comme une ERREUR. Les annoter en `CONTEXT` corrige la
 * précision SANS toucher au plancher de rappel : le cliquet garde exactement son sens.
 *
 * ⚠️ Choix conservateur assumé : même une valeur qu'un détecteur déterministe trouve est
 * annotée `CONTEXT` si elle vient de cet audit. Sous-estimer le rappel est sans danger ;
 * le gonfler en élargissant la vérité ne le serait pas.
 */
const RECALL_EXEMPT = new Set(["CONTEXT"]);

export function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .split(/[\s\-_/.,]+/)
    .filter((t) => t.length >= 2 || /\d/.test(t));
}
export function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[\s\-_/.,]/g, "");
}
export function isCjk(s: string): boolean {
  return /[぀-ヿ㐀-鿿가-힯]/.test(s);
}

/** Plancher d'inclusion : sous 3 caractères, « né » recouperait la moitié du corpus. */
const MIN_CONTAIN = 3;

/** `needle` apparaît-il dans `hay` en DÉBUT de token (bord de mot) ? Sans cette borne,
 *  « med » recouperait « immédiat » et l'inclusion absoudrait n'importe quoi. */
function atTokenStart(hay: string, needle: string): boolean {
  const h = hay.toLowerCase(), n = needle.toLowerCase();
  for (let i = h.indexOf(n); i !== -1; i = h.indexOf(n, i + 1)) {
    if (i === 0 || !/[\p{L}\p{N}]/u.test(h[i - 1])) return true;
  }
  return false;
}

/**
 * Une valeur DÉTECTÉE recoupe-t-elle la vérité annotée ? Son complément est LA définition du
 * faux positif, pour tous les bancs.
 *
 * ⚠️ UN SEUL foyer, importé — pas recopié. La version courte (`tokens(d).some(...)`) avait été
 * dupliquée dans cinq bancs, y avait perdu la branche CJK, et comptait comme erreur toute
 * détection correcte dans une langue sans espaces. `sourceFp.bench.ts` pin le comportement.
 *
 * Une annotation est un SPAN, pas un mot — d'où trois façons de recouper :
 *  1. un token significatif en commun ;
 *  2. CJK : inclusion de chaînes, faute de tokens ;
 *  3. inclusion bornée à un bord de token, dans les DEUX sens — « whitman » dans
 *     « laura.whitman@… », « 63000 » dans « NIORT (63000) », et à l'inverse
 *     « 東京都渋谷区道玄坂1-2-3 » qui contient l'adresse annotée. Détecter une PARTIE d'une
 *     donnée annotée n'est pas une erreur de détection : c'est la même donnée.
 *
 * Ce que la règle du bord REFUSE, et c'est voulu : « MrPaul » ne recoupe pas « Paul VASSEUR »
 * — la civilité est collée au prénom, donc le span est faux même si l'entité est la bonne.
 */
export function overlapsTruth(detected: string, truth: readonly string[]): boolean {
  if (!detected.trim()) return false;
  const truthTokens = new Set(truth.flatMap(tokens));
  if (tokens(detected).some((t) => truthTokens.has(t))) return true;
  const d = norm(detected);
  for (const t of truth) {
    const n = norm(t);
    // Le plancher est LATIN : un glyphe han/kana/hangul est un morphème entier, donc « 张伟 »
    // est un nom COMPLET — même exemption que le moteur (`local/CLAUDE.md`). L'appliquer à
    // tout comptait chaque nom CJK court comme une erreur.
    if (isCjk(detected) || isCjk(t)) {
      if (n && d.includes(n)) return true;
      if (d && n.includes(d)) return true;
      continue;
    }
    if (n.length < MIN_CONTAIN || d.length < MIN_CONTAIN) continue;
    if (atTokenStart(t, detected) || atTokenStart(detected, t)) return true;
  }
  return false;
}

/** Une vérité annotée est-elle COUVERTE par ce qui a été détecté ? Le pendant de
 *  {@link overlapsTruth} côté rappel, exposé pour que les bancs qui ventilent par
 *  catégorie n'en recodent pas une variante (règle 9 — c'est exactement comme ça que
 *  `overlapsTruth` avait dérivé dans cinq fichiers). */
export function coversTruth(value: string, detected: readonly string[]): boolean {
  const d = [...detected];
  return isCovered(value, d, norm(d.join(" ")), new Set(d.flatMap(tokens)));
}

function isCovered(value: string, detected: string[], bag: string, bagTokens: Set<string>): boolean {
  if (isCjk(value)) return bag.includes(norm(value));
  const tk = tokens(value);
  if (!tk.length) return false;
  const hit = tk.filter((t) => bagTokens.has(t) || bag.includes(norm(t))).length;
  return hit / tk.length >= 0.6;
}

export interface CaseScore {
  found: number;
  total: number;
  foundNameish: number;
  totalNameish: number;
  fp: number;
  misses: string[];
}

export function scoreCase(c: BenchCase, detected: string[]): CaseScore {
  const bag = norm(detected.join(" "));
  const bagTokens = new Set(detected.flatMap(tokens));
  const truthValues = c.truth.map(([v]) => v);
  const s: CaseScore = { found: 0, total: 0, foundNameish: 0, totalNameish: 0, fp: 0, misses: [] };
  for (const [value, cat] of c.truth) {
    if (RECALL_EXEMPT.has(cat)) continue;
    s.total++;
    if (NAMEISH.has(cat)) s.totalNameish++;
    if (isCovered(value, detected, bag, bagTokens)) {
      s.found++;
      if (NAMEISH.has(cat)) s.foundNameish++;
    } else s.misses.push(`${c.id}/${cat}:${value}`);
  }
  for (const d of detected) {
    if (!overlapsTruth(d, truthValues)) s.fp++;
  }
  return s;
}

export interface CorpusScore extends CaseScore {
  cases: number;
  byLang: Record<string, [found: number, total: number]>;
}

export async function scoreCorpus(cases: BenchCase[], detect: Detector): Promise<CorpusScore> {
  const agg: CorpusScore = {
    cases: cases.length, found: 0, total: 0, foundNameish: 0, totalNameish: 0,
    fp: 0, misses: [], byLang: {},
  };
  for (const c of cases) {
    const detected = await detect(c.text);
    const s = scoreCase(c, detected);
    agg.found += s.found; agg.total += s.total;
    agg.foundNameish += s.foundNameish; agg.totalNameish += s.totalNameish;
    agg.fp += s.fp; agg.misses.push(...s.misses);
    const l = (agg.byLang[c.lang] ??= [0, 0]);
    l[0] += s.found; l[1] += s.total;
  }
  return agg;
}

export const pct = (a: number, b: number): number => (b ? Math.round((100 * a) / b) : 0);
