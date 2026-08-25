import type { Detection, RedactionType, Vault } from "../../types";
import { redactionCategory } from "../../kinds";
import { entityKey } from "../../util";
import { CATEGORY_TOKEN } from "../../highlight/tokens";

/**
 * Phase 3, MODE JETONS — l'alternative à `allocate.ts` quand le modèle ne doit voir que
 * des marqueurs (`[PERSON1]`) et jamais un faux vraisemblable.
 *
 * Ce mode ne s'oppose pas à l'allocation de faux : il la SUPPRIME. Tout ce que
 * `allocate.ts` porte — pool de faux, recherche de collision sur 60 essais, cohérence géo
 * par bloc, `avoid`, index de mots, `salt`, alias e-mail/nom/lieu — n'existe que pour
 * qu'un faux reste plausible ET ne percute ni le texte ni un autre faux. Un jeton n'est
 * plausible pour rien et ne peut percuter personne : la seule chose à garantir ici est
 * l'unicité de la clé dans le coffre.
 *
 * Ce qui est CONSERVÉ, parce que ce sont des invariants du produit et pas des propriétés
 * des faux :
 *  - **une valeur réelle → un seul jeton**, sur toute la conversation (le coffre, relu à
 *    chaque tour, est la mémoire de ce choix) ;
 *  - **une entité → un seul NUMÉRO**, quelle que soit sa casse. `applyVault` est
 *    sensible à la casse, donc chaque casse a besoin de sa propre entrée de coffre ;
 *    elles partagent le numéro et ne diffèrent que par la casse du jeton
 *    (`[COMPANY1]` / `[Company1]` / `[company1]`), ce qu'un modèle lit comme un seul
 *    jeton alors que trois entrées distinctes restent réversibles chacune vers SA casse.
 *    Numéroter par valeur donnerait `[COMPANY1]`/`[COMPANY2]` pour une seule société —
 *    le modèle raisonnerait sur deux entreprises.
 *  - **jamais de valeur réelle laissée sur le fil** : si la clé calculée est déjà prise
 *    (ou présente telle quelle dans le texte de l'utilisateur), on incrémente jusqu'à
 *    trouver libre. La boucle termine — le compteur est monotone.
 *
 * La numérotation est TOUJOURS suffixée d'un indice, là où l'affichage
 * (`highlight/tokens.ts`) laisse `[IBAN]` nu quand la catégorie n'a qu'une valeur : cet
 * affichage-là connaît l'ensemble complet, le fil non — il alloue au fil de l'eau, sans
 * savoir si une deuxième valeur suivra.
 */
export interface AllocateTokensCtx {
  vault: Vault;
  reverse: Map<string, string>;
  taken: Set<string>;
  entityValues: string[];
  record: (type: RedactionType, value: string, token: string, category: string) => void;
  input: string;
}

/** `[PERSON12]` → sa famille + son indice. Sert à reprendre la numérotation d'un coffre
 *  existant : la casse est ignorée, les trois variantes d'une entité partageant l'indice. */
const TOKEN_RE = /^\[([A-Za-z][A-Za-z_]*?)(\d+)([a-z]?)\]$/;

/** Le mot de famille d'une catégorie fine, via la MÊME table que l'affichage (règle 9).
 *  `INFO` est le repli neutre : une valeur sans catégorie exploitable ne doit pas hériter
 *  du repli `secret` de `redactionCategory` et se lire `[SECRET]`. */
function tokenWord(category: string): string {
  return CATEGORY_TOKEN[redactionCategory(category)] ?? "INFO";
}

/** Les familles dont une même entité se réécrit couramment dans plusieurs casses (un nom en
 *  capitales dans un en-tête, une société en minuscules dans une adresse e-mail). Les
 *  valeurs STRUCTURÉES (IBAN, e-mail, téléphone, chemin…) n'ont pas cette variance : elles
 *  gardent toujours la forme canonique, ce qui évite un `[Iban1]` inutilement bavard. */
const CASED_KINDS = new Set(["name", "company", "location", "address", "health", "username"]);

/**
 * La casse du jeton MIROITE celle de la valeur — c'est ce qui donne une clé de coffre
 * distincte par casse tout en gardant UN numéro par entité (`applyVault` est sensible à la
 * casse, donc chaque casse a besoin de son entrée).
 *
 * La forme CANONIQUE est `[PERSON1]`, et elle sert la prose ordinaire (« Augustin Vaudel »,
 * casse de titre) : c'est de loin le cas majoritaire, et c'est aussi la forme que
 * l'affichage montre. Les deux autres n'existent que pour ne pas percuter la canonique —
 * une valeur tout en minuscules donne `[person1]`, une valeur tout en capitales `[Person1]`.
 * Ce dernier choix est arbitraire (les capitales auraient « mérité » la canonique), mais
 * c'est la casse la plus rare et le jeton reste visiblement le même.
 */
function caseMirror(word: string, n: number, value: string, cat: string): string {
  if (!CASED_KINDS.has(cat)) return `[${word}${n}]`;
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (!letters) return `[${word}${n}]`;
  if (value === value.toLowerCase()) return `[${word.toLowerCase()}${n}]`;
  if (value === value.toUpperCase()) return `[${word[0]}${word.slice(1).toLowerCase()}${n}]`;
  return `[${word}${n}]`;
}

/** Les mots par lesquels deux écritures d'une personne se reconnaissent : ≥4 lettres, ce
 *  qui écarte les particules (de/la/du/van) et les initiales sans avoir à les lister. */
function linkWords(value: string): string[] {
  return value
    .split(/[\s._-]+/)
    .filter((w) => /^\p{L}{4,}$/u.test(w))
    .map((w) => w.toLowerCase());
}

export function allocateTokens(deNested: Detection[], ctx: AllocateTokensCtx): void {
  const { vault, reverse, taken, entityValues, record, input } = ctx;
  // Compteur par famille, repris du coffre : un tour 2 doit continuer la numérotation du
  // tour 1, sinon deux personnes différentes reçoivent `[PERSON1]`.
  const counters = new Map<string, number>();
  for (const key of Object.keys(vault)) {
    const m = TOKEN_RE.exec(key);
    if (!m) continue;
    const word = m[1].toUpperCase();
    counters.set(word, Math.max(counters.get(word) ?? 0, Number(m[2])));
  }
  // `catégorie|clé d'entité` → l'indice déjà attribué à cette entité dans CE passage.
  // Les casses vues à des tours précédents se retrouvent, elles, par le coffre.
  const entityIndex = new Map<string, number>();
  // Mot distinctif → indice de la personne qui le porte. C'est le RATTRAPAGE des écritures
  // partielles : « Léa Morvan » puis « L. Morvan » ou « Morvan » tout court. Sans lui, un
  // compte rendu ordinaire (« Présents : Léa Morvan, L. Morvan (excusée)… ») donne QUATRE
  // jetons pour DEUX personnes, et le modèle compte quatre personnes. Le chemin des faux
  // tient ça par ses alias par mot (`identity/name.ts`), qui n'existent pas ici : un jeton
  // n'a pas de mots à partager. On partage donc l'INDICE, et la variante prend une lettre
  // (`[PERSON1b]`) — assez proche pour se lire comme la même personne, assez distincte pour
  // rester une clé de coffre à part, réversible vers SA propre écriture.
  // ⚠️ Deux homonymes (« Jean Morvan » / « Léa Morvan ») se retrouvent liés. C'est le même
  // arbitrage que côté faux, où ils partagent le faux patronyme : rapprocher à tort deux
  // personnes qui portent le même nom coûte moins cher que scinder une personne en quatre.
  const nameIndex = new Map<string, number>();
  // Une entité déjà connue (une autre casse est dans le coffre) doit retrouver SON numéro
  // plutôt qu'en consommer un nouveau.
  for (const [key, value] of Object.entries(vault)) {
    const m = TOKEN_RE.exec(key);
    if (!m) continue;
    const word = m[1].toUpperCase();
    const n = Number(m[2]);
    entityIndex.set(`${word}|${entityKey(value)}`, n);
    if (word === "PERSON") for (const w of linkWords(value)) if (!nameIndex.has(w)) nameIndex.set(w, n);
  }

  for (const { value, category } of deNested) {
    if (reverse.has(value)) {
      if (!entityValues.includes(value)) entityValues.push(value);
      record("secret", value, reverse.get(value)!, category);
      continue;
    }
    const cat = redactionCategory(category);
    const word = tokenWord(category);
    const idKey = `${word}|${entityKey(value)}`;
    const free = (t: string) => !taken.has(t) && !input.includes(t);
    const at = (n: number, suffix = "") =>
      caseMirror(word, n, value, cat).replace(/\]$/, `${suffix}]`);

    let n = entityIndex.get(idKey);
    let token = n !== undefined ? at(n) : "";
    // 2) Même personne écrite autrement (« L. Morvan » après « Léa Morvan ») : on garde SON
    //    numéro et on prend la première lettre de variante libre.
    if (n === undefined && cat === "name") {
      for (const w of linkWords(value)) {
        const known = nameIndex.get(w);
        if (known === undefined) continue;
        for (const s of "bcdefghijklmnopqrstuvwxyz") {
          if (free(at(known, s))) {
            n = known;
            token = at(known, s);
            break;
          }
        }
        if (n !== undefined) break;
      }
    }
    if (n === undefined || !free(token)) {
      // Nouvelle entité — ou collision (l'utilisateur a lui-même écrit « [PERSON1] », ou
      // deux casses se sont ramenées à la même forme). On avance jusqu'à une clé libre ;
      // le compteur ne redescend jamais, donc la boucle termine.
      do {
        n = (counters.get(word) ?? 0) + 1;
        counters.set(word, n);
        token = at(n);
      } while (!free(token));
      entityIndex.set(idKey, n);
    }
    if (cat === "name") for (const w of linkWords(value)) if (!nameIndex.has(w)) nameIndex.set(w, n);
    vault[token] = value;
    reverse.set(value, token);
    taken.add(token);
    entityValues.push(value);
    record("secret", value, token, category);
  }
}
