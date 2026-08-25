import { useEffect, type RefObject } from "react";

/**
 * Rendre une boîte de dialogue vraie AU CLAVIER : y amener le focus à l'ouverture, et l'y
 * garder.
 *
 * `aria-modal="true"` est une PROMESSE — il dit aux technologies d'assistance que le reste
 * de la page est hors-jeu. Sans ces deux gestes, la promesse est fausse : mesuré sur
 * l'accueil, le focus restait sur `body` et la première tabulation atterrissait sur le
 * logo du rail, DERRIÈRE la carte. Il fallait traverser toute l'app pour atteindre
 * « Suivant ».
 *
 * Ce qui est délibérément absent : Échap. Une modale de premier lancement n'a pas de
 * fermeture accidentelle — la sortie porte un nom, « Passer ».
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    /* Le conteneur lui-même prend le focus (`tabIndex={-1}` côté appelant) plutôt que son
       premier bouton : le lecteur d'écran annonce alors le titre du dialogue, et la
       tabulation suivante mène au premier contrôle — pas l'inverse. */
    root.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // Boucler aux deux bouts, et rattraper le cas « le focus est sorti » (un clic dans
      // le vide le pose sur le conteneur) : la tabulation y revient au premier contrôle.
      if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener("keydown", onKeyDown);
    // Sur le DOCUMENT aussi : quand le focus a fui derrière (une modale montée après coup),
    // la touche n'atteindrait jamais le conteneur.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ref]);
}

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
