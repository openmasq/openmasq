/**
 * Where the « / » palette may open, given the room around the composer.
 *
 * The palette is anchored ABOVE the input, because that is where the user is typing. On a
 * thread that works: the composer is docked at the bottom and there is a screenful above
 * it. On the HOME screen the composer is centred, so the room above is roughly half the
 * viewport minus the greeting — measured, the 320px card runs off the top of a 600px-tall
 * window, and `.welcome` (a scroller) clips whatever is left.
 *
 * Pure on purpose: the caller measures the DOM, this decides. A placement rule written
 * inline in a component is a rule nobody can test at the sizes that break it.
 */

/** The card's natural cap — mirrors `.composer-skill-menu`'s `max-height`. */
export const SLASH_MAX = 320;
/** Below this, the list shows ~2 rows and is more frustrating than useful: prefer the
 *  other side, even though the caret is not there. */
export const SLASH_MIN_USEFUL = 160;
/** Breathing room kept between the card and the window edge. */
const EDGE = 12;

export interface SlashPlacement {
  /** Open DOWNWARD instead (the anchor flips from `bottom` to `top`). */
  below: boolean;
  /** Cap for the card on the chosen side, in px. */
  maxHeight: number;
}

/**
 * @param spaceAbove px between the top of the composer's input and the top of the space
 *   it may use (viewport top, or the clipping ancestor's top — the caller picks the
 *   tighter of the two, since either one truncates the card).
 * @param spaceBelow the same, downward.
 */
export function placeSlashPalette(spaceAbove: number, spaceBelow: number): SlashPlacement {
  const above = Math.max(0, spaceAbove - EDGE);
  const below = Math.max(0, spaceBelow - EDGE);
  // 1. La place au-dessus suffit à la carte entière → on ne bouge pas.
  if (above >= SLASH_MAX) return { below: false, maxHeight: SLASH_MAX };
  // 2. Basculer n'a de sens que si ça ACHÈTE la carte entière. Sans ce seuil, la palette
  //    changeait de côté pour vingt pixels — un menu qui saute entre deux frappes coûte
  //    plus à l'utilisateur que quelques lignes de moins.
  if (below >= SLASH_MAX && below > above) return { below: true, maxHeight: SLASH_MAX };
  // 3. Au-dessus reste utilisable → on reste du côté du curseur, plus court.
  if (above >= SLASH_MIN_USEFUL) return { below: false, maxHeight: Math.min(SLASH_MAX, above) };
  // 4. Le dessus ne montre plus qu'une ou deux lignes : le dessous, s'il est meilleur.
  if (below > above) return { below: true, maxHeight: Math.min(SLASH_MAX, below) };
  // 5. Aucun côté n'est confortable : on garde celui du curseur, serré. JAMAIS zéro — une
  //    palette vide se lirait « aucune compétence », ce qui est une autre affirmation, fausse.
  return { below: false, maxHeight: Math.max(80, Math.min(SLASH_MAX, above)) };
}
