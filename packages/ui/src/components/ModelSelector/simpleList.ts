import { SIMPLE_MODEL_IDS } from "@openmasq/catalog";
import type { ModelInfo } from "@openmasq/llm";

/**
 * Les ids qui PEUPLENT la vue simplifiée : les favoris CHOISIS par l'utilisateur
 * (`Settings.favoriteModels`) s'ils existent, sinon la liste gouvernable du catalogue
 * (`@openmasq/catalog` `SIMPLE_MODEL_IDS`) — le défaut d'usine. Personnaliser REMPLACE,
 * ne s'ajoute pas : une liste courte qui grossit au fil des étoiles cesse d'être courte.
 */
export function favoriteSourceIds(favorites?: readonly string[]): readonly string[] {
  return favorites && favorites.length ? favorites : SIMPLE_MODEL_IDS;
}

/**
 * Ce que MONTRE la vue simplifiée : la source ci-dessus, réduite à ce que ce poste peut
 * réellement proposer — un modèle interdit par l'org, sans clé ou retiré du catalogue
 * n'apparaît pas plus ici qu'ailleurs.
 *
 * ⚠️ **Jamais un menu vide.** Si les favoris de l'utilisateur ne résolvent RIEN
 * d'utilisable (il a épinglé du Scaleway sans abonnement, ou des ids devenus caducs), on
 * retombe sur le défaut catalogue — sinon la personnalisation se retourne en mur. C'est
 * l'autre moitié de l'invariant « le sélecteur n'est jamais vide ».
 *
 * ⚠️ **Le modèle COURANT est toujours dans la liste, même hors favoris.** Sans cette
 * règle, passer en vue simplifiée avec un modèle choisi dans la vue complète le fait
 * DISPARAÎTRE du menu : la conversation tourne sur un modèle que son propre sélecteur ne
 * montre pas. Ajouté en QUEUE, jamais en tête — les favoris restent l'offre.
 *
 * Pur : `simpleList.test.ts` épingle les trois règles.
 */
export function simpleMenuModels(
  available: ModelInfo[],
  currentId: string,
  favorites?: readonly string[],
): ModelInfo[] {
  const byId = new Map(available.map((m) => [m.id, m]));
  const resolve = (ids: readonly string[]) =>
    ids.map((id) => byId.get(id)).filter((m): m is ModelInfo => !!m);

  let out = resolve(favoriteSourceIds(favorites));
  // Favoris tous inatteignables → repli sur le défaut catalogue (jamais vide).
  if (out.length === 0 && favorites && favorites.length) out = resolve(SIMPLE_MODEL_IDS);

  if (currentId && !out.some((m) => m.id === currentId)) {
    const current = byId.get(currentId);
    if (current) out.push(current);
  }
  return out;
}

/** L'ensemble EFFECTIF des favoris (choisis ou défaut), pour distinguer une entrée
 *  épinglée du modèle courant ajouté en queue — la vue en a besoin pour son séparateur. */
export function favoriteSet(favorites?: readonly string[]): Set<string> {
  return new Set(favoriteSourceIds(favorites));
}

/**
 * Épingler / retirer un id — pur, immuable. Un id déjà favori sort, sinon il entre en
 *  queue (l'ordre d'ajout EST l'ordre d'affichage).
 *
 * ⚠️ Vide = l'utilisateur est sur le DÉFAUT catalogue, affiché tout étoilé. Le premier
 * geste MATÉRIALISE ce défaut, sinon l'action est incohérente avec ce qui est montré :
 * retirer l'un des favoris affichés doit laisser les AUTRES, jamais réduire la liste au
 * seul id touché (le bug du 14/08 — `toggleFavoriteModel(undefined, x)` rendait `[x]`).
 * Tout retirer jusqu'à la liste vide re-bascule sur le défaut (un « réinitialiser »).
 */
export function toggleFavoriteModel(favorites: readonly string[] | undefined, id: string): string[] {
  const base = favorites && favorites.length ? favorites : SIMPLE_MODEL_IDS;
  return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
}

/** Un bloc de la liste courte : son intitulé et ses modèles, dans l'ordre d'affichage. */
export interface SimpleMenuSection {
  label: string;
  models: ModelInfo[];
}

/**
 * La liste courte, DÉCOUPÉE — parce qu'une liste de cinq lignes toutes pareilles ne dit
 * pas pourquoi ces cinq-là. Trois blocs, chacun répondant à une question différente :
 *
 * - **Par défaut** — le modèle des NOUVELLES conversations (`Settings.defaultModelId`).
 *   Il passe en TÊTE : c'est celui qui tourne quand on n'a rien choisi, et le lire au
 *   milieu des favoris ne dit pas ça. Le défaut d'usine l'y mettait déjà (`SIMPLE_MODEL_IDS`
 *   commence par `DEFAULT_MODEL_ID`) ; ce tri ne fait que tenir la promesse quand
 *   l'utilisateur a épinglé les siens, où le défaut se retrouvait n'importe où.
 * - **Favoris** — le reste de ce qui est épinglé (ou le défaut catalogue si rien ne l'est).
 * - **Modèle en cours** — la ligne ajoutée en queue quand la conversation tourne sur un
 *   modèle hors favoris. ⚠️ Ce bloc-là existait déjà, et pour une raison mesurée : sans
 *   lui, deux modèles homonymes servis par des routes différentes s'affichent deux fois à
 *   l'identique, la vue compacte masquant le fournisseur.
 *
 * Un bloc VIDE ne s'affiche pas — un intitulé sans ligne dessous est du bruit. Le défaut
 * n'est titré que s'il est dans les FAVORIS : lorsqu'il est aussi le modèle courant ajouté
 * en queue, c'est « Modèle en cours » qui le nomme, ce qui est l'information utile là.
 *
 * Pur — `simpleList.test.ts` épingle l'ordre et les cas vides.
 */
export function simpleMenuSections(
  models: readonly ModelInfo[],
  p: { favSet: ReadonlySet<string>; defaultId?: string },
): SimpleMenuSection[] {
  const fav = models.filter((m) => p.favSet.has(m.id));
  const hors = models.filter((m) => !p.favSet.has(m.id));
  const def = p.defaultId ? fav.find((m) => m.id === p.defaultId) : undefined;
  const sections: SimpleMenuSection[] = [];
  if (def) sections.push({ label: "Par défaut", models: [def] });
  const autres = def ? fav.filter((m) => m.id !== def.id) : fav;
  if (autres.length) sections.push({ label: "Favoris", models: autres });
  if (hors.length) sections.push({ label: "Modèle en cours", models: hors });
  return sections;
}
