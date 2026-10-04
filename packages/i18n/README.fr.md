[English](README.md)

# @openmasq/i18n

**Le catalogue de messages typé d'OpenMasq, en français et en anglais.**

Chaque texte qu'une personne lit dans l'application vient d'ici. Le français est la langue
source, l'anglais l'accompagne. Le paquet n'embarque ni React ni bibliothèque d'exécution :
le rendu, le processus principal de l'application de bureau et le proxy local
(`apps/proxy`) l'importent de la même façon. La couche React (`I18nProvider`, `useT()`)
se trouve dans `@openmasq/ui`.

## Contenu

- **Le contrat** : `src/messages.ts` déclare l'interface `Messages`, découpée par écran
  dans `src/messages/`. Une clé absente de l'une des deux langues est une erreur `tsc`.
- **Les deux catalogues** : `src/fr/` (la source) et `src/en/` (son miroir), assemblés par
  `src/fr.ts` et `src/en.ts`.
- **Les outils de langue** : `Locale`, `LOCALES`, `DEFAULT_LOCALE` (`"fr"`), `isLocale`,
  `resolveLocale` et `getMessages`, dans `src/locale.ts`.

```ts
import { getMessages, resolveLocale, DEFAULT_LOCALE } from "@openmasq/i18n";

const t = getMessages(resolveLocale(navigator.language) ?? DEFAULT_LOCALE);
```

Une entrée qui prend une variable est une fonction typée. Nombres, dates et montants
passent par `Intl`.

## Développer

```bash
pnpm --filter @openmasq/i18n build       # tsup → dist/
pnpm --filter @openmasq/i18n typecheck
pnpm test packages/i18n                  # depuis la racine du dépôt
pnpm check:i18n                          # le texte écrit en dur dans l'interface ne peut que baisser
```

> [!NOTE]
> Une nouvelle clé s'ajoute en français et en anglais dans la même modification.
> `check:i18n` est un cliquet sur `packages/ui/src`, `packages/catalog/src` et
> `packages/llm/src` : aucun fichier ne peut gagner de texte écrit en dur, dans l'une ou
> l'autre langue. Les conventions sont dans [`CLAUDE.md`](CLAUDE.md).
