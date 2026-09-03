import type { Dispatch, SetStateAction } from "react";
import { LOCALES, resolveLocale, type Locale } from "@openmasq/i18n";
import { Switch } from "../../components/brand";
import { LanguageFlag } from "../../components/media/CountryFlag";
import { captureEvent } from "../../analytics";
import { useLocale, useT } from "../../i18n";
import type { Settings } from "../../types";

/**
 * The "Apparence" settings section: LANGUAGE, then the light/dark ground.
 *
 * The two go together because they answer the same question — what the app SHOWS,
 * independent of what it does. Language comes first: it's the one that decides
 * what language the next row reads in.
 *
 * ## Why this section lives in its own file
 *
 * It's also the FIRST settings section to be fully translated (`t.settings.appearance`),
 * and that's no accident: it's the only one an English speaker must be able to reach BEFORE
 * having an app in their language. Leaving it hardcoded in French in the middle of `AccountTab`
 * would have made it a dead end.
 */
export function AppearanceSection({
  draft,
  setDraft,
}: {
  draft: Settings;
  setDraft: Dispatch<SetStateAction<Settings>>;
}) {
  const t = useT();
  const { locale, setLocale } = useLocale();

  // ONE axis to choose — the GROUND, light or dark. The accent is not a setting.
  const isDark = draft.theme === "dark";
  const themeFor = (dark: boolean): NonNullable<Settings["theme"]> => (dark ? "dark" : "light");
  const applyTheme = (theme: NonNullable<Settings["theme"]>) => {
    captureEvent({ name: "theme_toggle", theme });
    setDraft((d) => ({ ...d, theme }));
  };

  // What the picker shows comes from the SYNCED setting when it carries one, otherwise from
  // the provider's live language (itself: device key → host → default). In other words:
  // the checked box is always the one you have in front of your eyes.
  const activeLocale = resolveLocale(draft.language) ?? locale;

  // Two writes, two roles — and neither is one too many:
  //  • `setLocale` sets the DEVICE key (re-read BEFORE the first paint, even before
  //    auth has resolved) and switches the UI right away;
  //  • the draft writes `Settings.language`, the field that travels with the account.
  // Without the first, a language flash on every startup; without the second, a choice that
  // doesn't follow the user to their second device.
  const applyLocale = (next: Locale) => {
    captureEvent({ name: "language_change", locale: next });
    setLocale(next);
    setDraft((d) => ({ ...d, language: next }));
  };

  return (
    <section className="settings-section">
      <div className="cv-eyebrow">{t.settings.appearance.title}</div>
      <div className="settings-card">
        {/* A segmented control rather than a dropdown: two languages fit on screen, and
            the option NOT chosen stays readable — the whole point of a setting one comes
            to fix precisely because one doesn't understand what's displayed. The labels
            are ENDONYMS (« Français », « English »): they don't change with the
            current language, and `lang` tells the screen reader so, which would otherwise pronounce
            « English » the French way. */}
        <div className="toggle-row">
          <div className="row-body">
            <div className="row-title">{t.language.label}</div>
            <div className="row-desc">{t.language.hint}</div>
          </div>
          <div className="om-seg" role="radiogroup" aria-label={t.language.label}>
            {LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                role="radio"
                aria-checked={activeLocale === loc}
                lang={loc}
                className={`om-seg-btn${activeLocale === loc ? " on" : ""}`}
                onClick={() => applyLocale(loc)}
              >
                <LanguageFlag locale={loc} />
                {t.language.names[loc]}
              </button>
            ))}
          </div>
        </div>
        <div className="toggle-row">
          <div className="row-body">
            <div className="row-title">{t.settings.appearance.darkModeLabel}</div>
            <div className="row-desc">{t.settings.appearance.darkModeHint}</div>
          </div>
          <Switch checked={isDark} onChange={(v) => applyTheme(themeFor(v))} />
        </div>
      </div>
    </section>
  );
}
