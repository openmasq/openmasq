import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  getMessages,
  type Locale,
  type Messages,
} from "@openmasq/i18n";
import { initialLocale, saveDeviceLocale } from "../state/settings/locale";

/**
 * The REACT layer of i18n: a context that carries the current language + its catalogue,
 * and the `useT()` hook components call. The catalogue itself (typed, React-free)
 * lives in `@openmasq/i18n` — here, only the React wiring.
 *
 * ## Graceful degradation — INTENTIONAL
 *
 * `useT()` OUTSIDE a provider returns the default language's catalogue instead of throwing. A
 * component therefore never needs the provider to NOT CRASH — the provider is only
 * an enrichment (it brings the chosen language + hot switching). This is what
 * makes incremental adoption safe: a screen converted before the provider
 * wraps it simply renders French, never an error.
 *
 * ## Where the language comes from
 *
 * `initialLocale()` (`state/locale.ts`): device key → host → default. A change
 * goes through `setLocale`, which writes the device key AND bubbles up to the caller (`onLocaleChange`,
 * wired by the app to updating `Settings.language`) — the same double storage
 * as the theme.
 */
interface I18nContextValue {
  locale: Locale;
  t: Messages;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  /** Forces a language (tests, /preview). Absent ⇒ `initialLocale()`. */
  locale?: Locale;
  /** Bubbled up on every change, so the app persists it into `Settings.language`. */
  onLocaleChange?: (locale: Locale) => void;
}

export function I18nProvider({ children, locale: forced, onLocaleChange }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => forced ?? initialLocale());
  const active = forced ?? locale;

  // `<html lang>` follows the current language — for the screen reader and the
  // browser's hyphenation. An effect (post-mount) is enough: the boot splash is static HTML
  // with no translatable text, so nothing needs doing BEFORE the paint (which avoids touching
  // the `main.tsx` bootstrap).
  useEffect(() => {
    try {
      document.documentElement.setAttribute("lang", active);
    } catch {
      /* no DOM (test/SSR) — no effect */
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

/** The current language's catalogue. Outside a provider: the default language (see
 *  above — a screen not yet wrapped renders French, never an error). */
export function useT(): Messages {
  return useContext(I18nContext)?.t ?? getMessages(DEFAULT_LOCALE);
}

/** The fallback OUTSIDE a provider — a constant, not a new object on every render: `useLocale`
 *  can then be used as an effect dependency without looping. */
const NO_PROVIDER: Pick<I18nContextValue, "locale" | "setLocale"> = {
  locale: DEFAULT_LOCALE,
  setLocale: saveDeviceLocale,
};

/**
 * The current language + a way to change it. Its only caller is the Réglages
 * selector ("Compte" → Apparence): that is why the context already carried
 * `setLocale`.
 *
 * The same INTENTIONAL degradation as `useT()` — outside a provider, nothing throws. There is
 * then no catalogue to hot-switch, so `locale` is the default language and
 * `setLocale` merely writes the DEVICE key: the choice is not lost, it
 * applies on the next launch (`initialLocale`). A button that does less, never a
 * button that lies.
 */
export function useLocale(): Pick<I18nContextValue, "locale" | "setLocale"> {
  return useContext(I18nContext) ?? NO_PROVIDER;
}
