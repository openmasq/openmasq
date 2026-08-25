// Le faux DÉJÀ attribué à une personne — les deux façons de le retrouver, sorties de
// `pseudonymize/allocate.ts` (plafond 300 LOC) et posées là où vit le reste de l'identité.
//
// L'allocateur ne décide pas d'un nouveau faux tant que l'une des deux n'a pas répondu :
// c'est ce qui tient l'invariant « une valeur réelle → UN faux, pour toute la
// conversation ». Ce module ne MUTE rien ; il rend le faux à réutiliser, ou `undefined`.
import { recaseLike } from "../../recase";
import { capitalize } from "../../util";
import { reconstructName } from "./name";

/** Résolveurs fournis par la passe en cours (voir `pseudonymize/index.ts`). */
interface IdentityResolvers {
  /** Le faux canonique d'UN MOT (jeton de nom, domaine), tolérant à la casse. */
  resolveFakeCI: (real: string) => string | undefined;
  /** Le faux d'une VALEUR ENTIÈRE déjà connue du coffre, quelle qu'en soit la casse. */
  resolveEntityFakeCI: (real: string) => string | undefined;
}

/**
 * Le faux à réutiliser pour `value`, recasé sur CETTE occurrence — ou `undefined` s'il
 * faut en battre un neuf. Deux chemins, dans cet ordre :
 *
 * 1. **Par MOTS** (`reconstructName`) : chaque mot a déjà son faux canonique, donc le nom
 *    entier se reconstruit. La recasse est indispensable — un alias canonique est stocké
 *    en minuscules, et une casse que les deux alias (Titre + minuscule) ne couvrent pas —
 *    typiquement les CAPITALES d'un en-tête de formulaire — restait NON MAPPÉE, donc le
 *    vrai nom partait au modèle.
 * 2. **Par VALEUR ENTIÈRE** (`resolveEntityFakeCI`) : le coffre connaît déjà cette entité
 *    sous une autre casse ET, le plus souvent, sous une autre CATÉGORIE. C'est le cas d'un
 *    résultat d'outil — le document 1 a vaulté « KARL STUDIO » en ORGANISATION (entrée
 *    entière, sans alias par mot), le résultat suivant écrit « Karl Studio », le lexique de
 *    prénoms le classe NAME, et l'allocateur mintait une SECONDE identité pour la même
 *    société. Les catégories `isRecase` le faisaient déjà ; NAME était le seul trou.
 *    ⚠️ Ne se voit qu'avec un coffre PRÉ-CHARGÉ : une sonde en une seule passe unifie les
 *    casses toute seule et conclut, à tort, que le moteur est sain (`aiKinds.test.ts`).
 *
 * `input` sert d'ultime garde-fou : un faux qui figure DÉJÀ dans le texte n'en est pas un.
 */
export function reuseNameFake(
  value: string,
  input: string,
  { resolveFakeCI, resolveEntityFakeCI }: IdentityResolvers,
): string | undefined {
  const reconstructed = reconstructName(value, resolveFakeCI);
  if (reconstructed) {
    const base = reconstructed
      .split(/([\s._-]+)/) // les séparateurs par lesquels les mots d'un nom se joignent
      .map((t, i) => (i % 2 === 1 ? t : capitalize(t)))
      .join("");
    return recaseLike(base, value);
  }
  const known = resolveEntityFakeCI(value);
  if (known === undefined) return undefined;
  const cased = recaseLike(known, value);
  return cased !== value && !input.includes(cased) ? cased : undefined;
}
