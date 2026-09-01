import { useEffect, type RefObject } from "react";

/**
 * Make a dialog TRULY work with the keyboard: bring focus to it on open, and keep
 * it there.
 *
 * `aria-modal="true"` is a PROMISE — it tells assistive technology that the rest of
 * the page is out of play. Without these two gestures, the promise is false:
 * measured on onboarding, focus stayed on `body` and the first tab landed on the
 * rail's logo, BEHIND the card. You had to traverse the whole app to reach
 * "Suivant".
 *
 * What is deliberately absent: Escape. A first-launch modal has no accidental
 * closing — the way out has a name, "Passer".
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    /* The container itself takes focus (`tabIndex={-1}` on the caller's side) rather than
       its first button: the screen reader then announces the dialog's title, and the
       next tab leads to the first control — not the other way around. */
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
      // Loop at both ends, and catch the "focus escaped" case (a click in empty
      // space lands it on the container): tabbing from there returns to the first control.
      if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener("keydown", onKeyDown);
    // On the DOCUMENT too: when focus has fled elsewhere (a modal mounted afterwards),
    // the key would never reach the container.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ref]);
}

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
