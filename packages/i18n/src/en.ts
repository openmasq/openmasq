/**
 * The ENGLISH catalogue — a translation of the French source (`fr.ts`).
 *
 * `satisfies Messages`: the compiler demands EXACTLY the contract's keys. A key added to
 * `fr.ts` that is not mirrored here fails `tsc` — which is how "fully translated, French
 * AND English" stays true by construction rather than by vigilance.
 */
import type { Messages } from "./messages";

export const en = {
  common: {
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    retry: "Retry",
    delete: "Delete",
    confirm: "Confirm",
    loading: "Loading…",
    genericError: "Something went wrong. Please try again.",
  },
  nav: {
    ariaLabel: "Navigation",
    chats: "Chats",
    competences: "Skills",
    memory: "Memory",
    vault: "Vault",
    library: "Library",
    settings: "Settings",
  },
  billing: {
    checkoutOpenFailed: "Couldn't open the payment page. Please try again.",
  },
  language: {
    label: "Language",
    // Endonyms — each language named in its OWN tongue, identical across catalogues.
    names: { fr: "Français", en: "English" },
  },
} satisfies Messages;
