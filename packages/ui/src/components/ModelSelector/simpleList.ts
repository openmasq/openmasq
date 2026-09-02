import type { Messages } from "@openmasq/i18n";
import { SIMPLE_MODEL_IDS } from "@openmasq/catalog";
import type { ModelInfo } from "@openmasq/llm";

/**
 * The ids that POPULATE the simplified view: the favorites CHOSEN by the user
 * (`Settings.favoriteModels`) if they exist, otherwise the FACTORY list — the catalogue's
 * governable `SIMPLE_MODEL_IDS`, led by the access-path models that are ready here
 * (`prompt/defaultModel.ts` `factorySimpleIds`: a switched-on, found Claude Code or Codex
 * CLI). Personalizing REPLACES, it doesn't add: a short list that grows with every star
 * stops being short.
 */
export function favoriteSourceIds(
  favorites?: readonly string[],
  factory: readonly string[] = SIMPLE_MODEL_IDS,
): readonly string[] {
  return favorites && favorites.length ? favorites : factory;
}

/**
 * What the simplified view SHOWS: the source above, narrowed to what this seat can
 * actually offer — a model forbidden by the org, keyless or removed from the catalogue
 * doesn't show up here any more than elsewhere.
 *
 * ⚠️ **Never an empty menu.** If the user's favorites resolve to NOTHING
 * usable (they pinned Scaleway with no subscription, or ids that have gone stale), we
 * fall back to the default catalogue — otherwise personalization turns into a wall. That's
 * the other half of the invariant « the selector is never empty ».
 *
 * ⚠️ **The CURRENT model is always in the list, even outside favorites.** Without this
 * rule, switching to the simplified view with a model chosen in the full view makes it
 * DISAPPEAR from the menu: the conversation runs on a model its own selector doesn't
 * show. Added at the TAIL, never at the front — favorites remain the offer.
 *
 * Pure: `simpleList.test.ts` pins the three rules.
 */
export function simpleMenuModels(
  available: ModelInfo[],
  currentId: string,
  favorites?: readonly string[],
  factory: readonly string[] = SIMPLE_MODEL_IDS,
): ModelInfo[] {
  const byId = new Map(available.map((m) => [m.id, m]));
  const resolve = (ids: readonly string[]) =>
    ids.map((id) => byId.get(id)).filter((m): m is ModelInfo => !!m);

  let out = resolve(favoriteSourceIds(favorites, factory));
  // All favorites unreachable → fall back to the factory list (never empty).
  if (out.length === 0 && favorites && favorites.length) out = resolve(factory);

  if (currentId && !out.some((m) => m.id === currentId)) {
    const current = byId.get(currentId);
    if (current) out.push(current);
  }
  return out;
}

/** The EFFECTIVE set of favorites (chosen or default), to distinguish a pinned
 *  entry from the current model added at the tail — the view needs it for its separator. */
export function favoriteSet(
  favorites?: readonly string[],
  factory: readonly string[] = SIMPLE_MODEL_IDS,
): Set<string> {
  return new Set(favoriteSourceIds(favorites, factory));
}

/**
 * Pin / remove an id — pure, immutable. An id already favorite goes out, otherwise it
 *  enters at the tail (the add order IS the display order).
 *
 * ⚠️ Empty = the user is on the DEFAULT catalogue, shown fully starred. The first
 * gesture MATERIALIZES this default, or the action is inconsistent with what is shown:
 * removing one of the displayed favorites must leave the OTHERS, never reduce the list to
 * the single id touched (the 14/08 bug — `toggleFavoriteModel(undefined, x)` returned `[x]`).
 * Removing all of them down to an empty list switches back to the default (a « reset »).
 */
export function toggleFavoriteModel(
  favorites: readonly string[] | undefined,
  id: string,
  factory: readonly string[] = SIMPLE_MODEL_IDS,
): string[] {
  const base = favorites && favorites.length ? favorites : factory;
  return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
}

/** A block of the short list: its heading and its models, in display order. */
export interface SimpleMenuSection {
  label: string;
  models: ModelInfo[];
}

/**
 * The short list, SPLIT — because a list of five identical-looking rows doesn't say
 * why those five. Three blocks, each answering a different question:
 *
 * - **Par défaut** — the model for NEW conversations (`Settings.defaultModelId`).
 *   It goes to the FRONT: it's the one running when nothing has been chosen, and reading it in the
 *   middle of favorites doesn't say that. The factory default already put it there (`SIMPLE_MODEL_IDS`
 *   starts with `DEFAULT_MODEL_ID`); this sort only keeps that promise once
 *   the user has pinned their own, where the default could end up anywhere.
 * - **Favoris** — the rest of what's pinned (or the default catalogue if nothing is).
 * - **Modèle en cours** — the row added at the tail when the conversation runs on a
 *   model outside favorites. ⚠️ This block already existed, for a measured reason: without
 *   it, two same-named models served by different routes displayed identically twice,
 *   the compact view hiding the provider.
 *
 * An EMPTY block doesn't display — a heading with no row under it is noise. The default
 * is only titled if it's among the FAVORITES: when it's also the current model added
 * at the tail, it's « Modèle en cours » that names it, which is the useful information there.
 *
 * Pure — `simpleList.test.ts` pins the order and the empty cases.
 */
export function simpleMenuSections(
  models: readonly ModelInfo[],
  p: { favSet: ReadonlySet<string>; defaultId?: string },
  t: Messages,
): SimpleMenuSection[] {
  const fav = models.filter((m) => p.favSet.has(m.id));
  const hors = models.filter((m) => !p.favSet.has(m.id));
  const def = p.defaultId ? fav.find((m) => m.id === p.defaultId) : undefined;
  const sections: SimpleMenuSection[] = [];
  if (def) sections.push({ label: t.modelPicker.sectionDefault, models: [def] });
  const autres = def ? fav.filter((m) => m.id !== def.id) : fav;
  if (autres.length) sections.push({ label: t.modelPicker.sectionFavorites, models: autres });
  if (hors.length) sections.push({ label: t.modelPicker.sectionCurrent, models: hors });
  return sections;
}
