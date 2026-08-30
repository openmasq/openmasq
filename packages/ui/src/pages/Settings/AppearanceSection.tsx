import type { Dispatch, SetStateAction } from "react";
import { LOCALES, resolveLocale, type Locale } from "@openmasq/i18n";
import { Switch } from "../../components/brand";
import { captureEvent } from "../../analytics";
import { useLocale, useT } from "../../i18n";
import type { Settings } from "../../types";

/**
 * La section « Apparence » des réglages : la LANGUE, puis le fond clair/sombre.
 *
 * Les deux vont ensemble parce qu'ils répondent à la même question — ce que l'app MONTRE,
 * indépendamment de ce qu'elle fait. La langue passe en premier : c'est elle qui décide
 * dans quelle langue se lit la ligne d'après.
 *
 * ## Pourquoi cette section vit dans son propre fichier
 *
 * C'est aussi la PREMIÈRE section de réglages entièrement traduite (`t.settings.appearance`),
 * et ce n'est pas un hasard : c'est la seule qu'un anglophone doit pouvoir atteindre AVANT
 * d'avoir une app dans sa langue. La laisser en français en dur au milieu de `AccountTab`
 * aurait fait d'elle un cul-de-sac.
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

  // Le thème avait deux axes ; il n'en reste qu'UN au choix — le FOND, clair ou sombre.
  // L'accent est l'indigo dans les deux cas : `blueAccent` (state/storePersistence) traduit
  // aussi les thèmes verts déjà persistés, donc ce commutateur ne peut plus produire de
  // valeur que cette fonction refuserait.
  const isDark = draft.theme === "dark" || draft.theme === "blue-dark";
  const themeFor = (dark: boolean): NonNullable<Settings["theme"]> => (dark ? "blue-dark" : "blue");
  const applyTheme = (theme: NonNullable<Settings["theme"]>) => {
    captureEvent({ name: "theme_toggle", theme });
    setDraft((d) => ({ ...d, theme }));
  };

  // Ce que le sélecteur montre vient du réglage SYNCHRONISÉ quand il en porte un, sinon de
  // la langue vive du provider (elle-même : clé d'appareil → hôte → défaut). Autrement dit :
  // la case cochée est toujours celle qu'on a sous les yeux.
  const activeLocale = resolveLocale(draft.language) ?? locale;

  // Deux écritures, deux rôles — et aucune n'est de trop :
  //  • `setLocale` pose la clé d'APPAREIL (relue AVANT le premier paint, avant même que
  //    l'auth ait résolu) et bascule l'interface tout de suite ;
  //  • le brouillon écrit `Settings.language`, le champ qui voyage avec le compte.
  // Sans la première, un flash de langue à chaque démarrage ; sans la seconde, un choix qui
  // ne suit pas l'utilisateur sur son second appareil.
  const applyLocale = (next: Locale) => {
    captureEvent({ name: "language_change", locale: next });
    setLocale(next);
    setDraft((d) => ({ ...d, language: next }));
  };

  return (
    <section className="settings-section">
      <div className="cv-eyebrow">{t.settings.appearance.title}</div>
      <div className="settings-card">
        {/* Un segmenté plutôt qu'une liste déroulante : deux langues tiennent à l'écran, et
            l'option NON retenue reste lisible — tout l'enjeu d'un réglage qu'on vient
            corriger justement parce qu'on ne comprend pas ce qui s'affiche. Les libellés
            sont des ENDONYMES (« Français », « English ») : ils ne changent pas avec la
            langue courante, et `lang` le dit au lecteur d'écran, qui sinon prononcerait
            « English » à la française. */}
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
