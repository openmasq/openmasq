import { DEFAULT_LOCALE, resolveLocale, type Locale } from "@openmasq/i18n";
import { migrateLegacyLocalStorage } from "./legacyStorage";

/**
 * La LANGUE — une préférence d'APPAREIL, exactement comme le THÈME (`theme.ts`), et pour
 * la même raison : elle doit être connue AVANT le premier paint (sinon un flash de
 * langue) et AVANT que l'auth ait résolu (l'écran de connexion est déjà dans une langue).
 *
 * Deux stockages, en miroir du thème : une clé localStorage NON SCOPÉE (lue au boot,
 * indépendante du compte) et un champ `Settings.language` (pour l'UI et la synchro
 * inter-appareils). `applyPersistedLocale` recopie le réglage vers la clé d'appareil, de
 * sorte que le prochain démarrage lise la bonne langue avant que le blob de réglages
 * soit chargé.
 *
 * ⚠️ Le repli n'est JAMAIS un écran vide : clé d'appareil → langue de l'hôte
 * (`navigator.language`) → `DEFAULT_LOCALE` (le français, langue source).
 */
export const LOCALE_KEY = "openmasq.language";

/** La langue enregistrée sur CET appareil, ou `null` si jamais posée. */
export function loadDeviceLocale(): Locale | null {
  migrateLegacyLocalStorage(); // aligné sur `theme.ts` — les clés d'avant le renommage
  try {
    return resolveLocale(localStorage.getItem(LOCALE_KEY));
  } catch {
    return null; // localStorage indisponible — le caller reprend son repli
  }
}

export function saveDeviceLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* localStorage indisponible — la langue en mémoire pilote quand même l'app */
  }
}

/** La langue de l'HÔTE (le navigateur / l'OS), ramenée à une locale livrée, ou `null`. */
export function hostLocale(): Locale | null {
  try {
    const nav = (globalThis as { navigator?: { language?: string } }).navigator;
    return resolveLocale(nav?.language);
  } catch {
    return null;
  }
}

/**
 * La langue à utiliser AU BOOT, dans l'ordre : ce que l'appareil a mémorisé, sinon la
 * langue de l'hôte, sinon le défaut. C'est l'état initial du provider (`I18nProvider`) —
 * une seule décision, réutilisée si le pré-paint revient un jour (règle 9). Le
 * `<html lang>` est posé PAR le provider (effet), pas ici : le splash de boot est du HTML
 * statique sans texte traduisible, donc rien à faire avant le premier paint.
 */
export function initialLocale(): Locale {
  return loadDeviceLocale() ?? hostLocale() ?? DEFAULT_LOCALE;
}
