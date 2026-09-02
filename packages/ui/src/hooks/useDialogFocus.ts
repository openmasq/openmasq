import { useEffect, useRef, type RefObject } from "react";

/**
 * Make a dialog TRULY work with the keyboard: bring focus to it on open, keep it
 * there, and hand it back to the control that opened it on close.
 *
 * `aria-modal="true"` is a PROMISE — it tells assistive technology that the rest of
 * the page is out of play. Without these gestures, the promise is false: measured on
 * onboarding, focus stayed on `body` and the first tab landed on the rail's logo,
 * BEHIND the card. You had to traverse the whole app to reach "Suivant".
 *
 * Three rules, each with a reason:
 * - The container takes focus (`tabIndex={-1}` on the caller's side) rather than its
 *   first button: the screen reader then announces the dialog's title, and the next
 *   tab leads to the first control — not the other way around. UNLESS the dialog
 *   already put focus inside itself (`autoFocus` on a confirm button, an input): that
 *   choice is the dialog's, and it runs before this effect — we never override it.
 * - Only the TOPMOST dialog traps. Dialogs stack (a confirm over an editor), and each
 *   mounts its own trap; a document-level fallback that ignored the stack would let
 *   the one BELOW yank focus back from the one on top.
 * - On unmount, focus returns to the element that had it when the dialog OPENED
 *   (captured at first render, before any `autoFocus` moved it) — but only if focus is
 *   still ours or was dropped on `body`; a user who moved elsewhere keeps their place.
 *
 * What is deliberately absent: Escape. Dismissal belongs to the dialog (`ModalShell`
 * handles it on the panel); a first-launch modal has no accidental closing at all —
 * the way out has a name, "Passer".
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, opts: { enabled?: boolean } = {}): void {
  const enabled = opts.enabled ?? true;
  // Read during RENDER (the only moment that precedes the dialog's own `autoFocus`):
  // it is the opener we hand focus back to. Read-only, so safe in render.
  const opener = useRef<HTMLElement | null>(null);
  if (opener.current === null && typeof document !== "undefined")
    opener.current = document.activeElement as HTMLElement | null;

  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;

    if (!root.contains(document.activeElement)) root.focus({ preventScroll: true });
    stack.push(root);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || stack[stack.length - 1] !== root) return;
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

    // On the DOCUMENT, capture phase: when focus has fled elsewhere (a click on the
    // scrim, a removed control), the key would never reach the container. The stack
    // check above keeps a buried dialog from answering for the one on top.
    document.addEventListener("keydown", onKeyDown, true);
    const at = opener.current;
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const i = stack.lastIndexOf(root);
      if (i >= 0) stack.splice(i, 1);
      const active = document.activeElement;
      const ours = active === null || active === document.body || root.contains(active);
      if (ours && at && at !== document.body && at.isConnected) at.focus({ preventScroll: true });
    };
  }, [ref, enabled]);
}

/** The open dialogs, bottom → top. Module-level on purpose: the stack is a fact about
 *  the DOCUMENT, not about any one dialog. */
const stack: HTMLElement[] = [];

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
