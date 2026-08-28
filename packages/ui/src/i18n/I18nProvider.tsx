import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  getMessages,
  type Locale,
  type Messages,
} from "@openmasq/i18n";
import { initialLocale, saveDeviceLocale } from "../state/locale";

/**
 * La couche REACT de l'i18n : un contexte qui porte la langue courante + son catalogue,
 * et le hook `useT()` que les composants appellent. Le catalogue lui-même (typé, sans
 * React) vit dans `@openmasq/i18n` — ici, seulement le branchement React.
 *
 * ## Dégradation gracieuse — VOULUE
 *
 * `useT()` HORS provider rend le catalogue de la langue par défaut au lieu de jeter. Un
 * composant n'a donc jamais besoin du provider pour NE PAS PLANTER — le provider n'est
 * qu'un enrichissement (il apporte la langue choisie + le changement à chaud). C'est ce
 * qui rend l'adoption incrémentale sûre : un écran converti avant que le provider ne
 * l'enrobe rend simplement du français, jamais une erreur.
 *
 * ## Où vient la langue
 *
 * `initialLocale()` (`state/locale.ts`) : clé d'appareil → hôte → défaut. Le changement
 * passe par `setLocale`, qui écrit la clé d'appareil ET remonte au caller (`onLocaleChange`,
 * branché par l'app sur la mise à jour de `Settings.language`) — le même double stockage
 * que le thème.
 */
interface I18nContextValue {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  /** Force une langue (tests, /preview). Absent ⇒ `initialLocale()`. */
  locale?: Locale;
  /** Remonté à chaque changement, pour que l'app le persiste dans `Settings.language`. */
  onLocaleChange?: (locale: Locale) => void;
}

export function I18nProvider({ children, locale: forced, onLocaleChange }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => forced ?? initialLocale());
  const active = forced ?? locale;

  // `<html lang>` suit la langue courante — pour le lecteur d'écran et la césure du
  // navigateur. Un effet (post-montage) suffit : le splash de boot est du HTML statique
  // sans texte traduisible, donc rien à faire AVANT le paint (ce qui évite de toucher au
  // bootstrap `main.tsx`).
  useEffect(() => {
    try {
      document.documentElement.setAttribute("lang", active);
    } catch {
      /* pas de DOM (test/SSR) — sans effet */
    }
  }, [active]);

  const setLocale = useCallback(
    (next: Locale) => {
      saveDeviceLocale(next);
      setLocaleState(next);
      onLocaleChange?.(next);
    },
    [onLocaleChange],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale: active, t: getMessages(active), setLocale }),
    [active, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Le catalogue de la langue courante. Hors provider : la langue par défaut (voir plus
 *  haut — un écran non encore enrobé rend du français, jamais une erreur). */
export function useT(): Messages {
  return useContext(I18nContext)?.t ?? getMessages(DEFAULT_LOCALE);
}

// NOTE : `useLocale()` (lire/changer la langue courante) viendra AVEC le sélecteur de
// langue des Réglages — son unique consommateur. Le contexte porte déjà `locale` et
// `setLocale` ; l'exposer sans appelant ferait échouer le cliquet knip (export inutilisé).
// Le changement de langue passe entre-temps par `onLocaleChange` (câblé sur les réglages).
