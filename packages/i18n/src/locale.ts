/**
 * La LANGUE : l'union des locales, le catalogue par langue, et la résolution d'une
 * chaîne quelconque (`app.getLocale()` → « fr-FR », `navigator.language` → « en-GB »)
 * vers une locale que l'app connaît. Pur, sans React, sans I/O — importable par le
 * renderer, par `main`, par `emails`, par le backend.
 *
 * ## Ajouter une langue
 *
 * Un nouveau `xx.ts` qui `satisfies Messages`, sa clé ajoutée à `Locale` ET à `MESSAGES`.
 * Le compilateur exige alors chaque clé du contrat (`messages.ts`) : la porte est
 * ouverte, et une langue incomplète ne compile pas. `LOCALES` en découle, donc tout ce
 * qui itère les langues (un sélecteur, un test de complétude) les voit toutes sans
 * seconde liste (règle 9).
 */
import type { Messages } from "./messages";
import { fr } from "./fr";
import { en } from "./en";

/** Les langues livrées. Étendre = ajouter un membre ici ET une entrée à `MESSAGES`. */
export type Locale = "fr" | "en";

/** Le catalogue par langue — la SEULE table. `LOCALES` et `getMessages` en dérivent, donc
 *  une langue ajoutée ici est partout à la fois. */
export const MESSAGES: Record<Locale, Messages> = { fr, en };

/** Toutes les locales livrées, dans l'ordre d'affichage (source = français). */
export const LOCALES = Object.keys(MESSAGES) as Locale[];

/** La langue par défaut : le français, langue source du produit. C'est aussi le repli
 *  ultime quand rien n'a pu être résolu (fail-safe, jamais un écran vide). */
export const DEFAULT_LOCALE: Locale = "fr";

/** Vrai si `x` est une locale livrée. */
export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as string[]).includes(x);
}

/**
 * Ramène une étiquette de langue quelconque à une locale livrée, ou `null` si aucune ne
 * correspond (le caller choisit alors son repli — souvent `DEFAULT_LOCALE`). On lit la
 * SOUS-ÉTIQUETTE primaire (« en-GB » → « en », « fr_CA » → « fr »), insensible à la
 * casse, tolérante au `_` comme au `-`. `null` plutôt qu'un défaut caché : le repli est
 * une décision du caller, pas un silence de cette fonction.
 */
export function resolveLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const primary = tag.toLowerCase().replace(/_/g, "-").split("-")[0];
  return isLocale(primary) ? primary : null;
}

/** Le catalogue d'une locale. Une locale hors union retombe sur le défaut (fail-safe). */
export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
}
