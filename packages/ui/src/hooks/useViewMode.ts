import { useCallback, useEffect, useState } from "react";
import { BRAND } from "@openmasq/branding";

/** Grille de cartes, ou rangées denses. Deux valeurs, pas trois : un troisième mode se
 *  paie en décisions à chaque écran et personne ne l'a demandé. */
export type ViewMode = "grid" | "list";

/** Les écrans qui listent des OBJETS de l'utilisateur. Le périmètre est fermé exprès :
 *  une chaîne libre laisserait deux écrans partager une préférence par accident. */
export type ViewScope = "library" | "competences" | "workflows";

const KEY = (scope: ViewScope): string => `${BRAND.slug}.view.${scope}`;

/**
 * Le mode d'affichage d'un écran, retenu d'une session à l'autre.
 *
 * PAR ÉCRAN, jamais globalement : une bibliothèque d'images se regarde en vignettes, une
 * liste de compétences se lit en lignes, et imposer le même choix aux deux force à le
 * refaire à chaque va-et-vient.
 *
 * Il vit dans `localStorage` et non dans les Réglages parce que c'est une préférence de
 * VUE, pas une donnée : elle ne se synchronise pas, ne se chiffre pas, et son absence
 * n'est pas une perte. Même étagère que la section courante et la disposition
 * (`state/reduxBoot.ts`), même conséquence si le stockage manque — on retombe sur la
 * grille sans rien casser.
 *
 * ⚠️ Une valeur inconnue (build plus ancien, stockage trafiqué) retombe sur `"grid"` :
 * on ne rend jamais un mode que l'écran ne sait pas dessiner.
 */
export function useViewMode(scope: ViewScope): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => read(scope));

  // Le scope peut changer si un écran est réutilisé pour deux gisements : relire, sinon
  // le second héritait silencieusement de la préférence du premier.
  useEffect(() => {
    setMode(read(scope));
  }, [scope]);

  const set = useCallback(
    (m: ViewMode) => {
      setMode(m);
      try {
        localStorage.setItem(KEY(scope), m);
      } catch {
        /* stockage indisponible (aperçu web restreint) — la vue marche, elle n'est pas retenue */
      }
    },
    [scope],
  );

  return [mode, set];
}

function read(scope: ViewScope): ViewMode {
  try {
    return localStorage.getItem(KEY(scope)) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}
