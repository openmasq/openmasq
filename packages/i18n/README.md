[Français](README.fr.md)

# @openmasq/i18n

**The typed message catalogue for OpenMasq, in French and English.**

Every string a person reads in the app comes from here. French is the source language and
English ships beside it. The package has no React and no runtime library, so the renderer,
the desktop main process and the local proxy (`apps/proxy`) import it alike. The React layer
(`I18nProvider`, `useT()`) lives in `@openmasq/ui`.

## What's inside

- **The contract**: `src/messages.ts` declares the `Messages` interface, one slice per
  screen in `src/messages/`. A key missing from either language is a `tsc` error.
- **The two catalogues**: `src/fr/` (source) and `src/en/` (its mirror), assembled by
  `src/fr.ts` and `src/en.ts`.
- **Locale helpers**: `Locale`, `LOCALES`, `DEFAULT_LOCALE` (`"fr"`), `isLocale`,
  `resolveLocale` and `getMessages`, in `src/locale.ts`.

```ts
import { getMessages, resolveLocale, DEFAULT_LOCALE } from "@openmasq/i18n";

const t = getMessages(resolveLocale(navigator.language) ?? DEFAULT_LOCALE);
```

Entries that take a variable are typed functions. Numbers, dates and currencies go through
`Intl`.

## Develop

```bash
pnpm --filter @openmasq/i18n build       # tsup → dist/
pnpm --filter @openmasq/i18n typecheck
pnpm test packages/i18n                  # from the repository root
pnpm check:i18n                          # hard-coded copy in the UI can only go down
```

> [!NOTE]
> A new key goes into French and English in the same change. `check:i18n` is a ratchet over
> `packages/ui/src`, `packages/catalog/src` and `packages/llm/src`: a file may not gain
> hard-coded copy in either language. The conventions are in [`CLAUDE.md`](CLAUDE.md).
