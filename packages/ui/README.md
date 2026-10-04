[Français](README.fr.md)

# @openmasq/ui

**The OpenMasq interface: every screen, the app state and the design system.**

This package holds all the React code of the app. It never reaches the operating system, a
database or the network directly. It goes through a `Host` the app injects (`src/host/`).
`apps/desktop` implements that `Host` and mounts the interface; `apps/proxy` only uses the
tooltip helper (`@openmasq/ui/tooltip`). It is a private workspace package, not published
on npm.

## What's inside

- **Pages** (`src/pages/`): one folder per screen (chat, library, settings, skills, memory,
  vault, onboarding, login). A page renders its screen and collects the user's choices.
- **Containers** (`src/containers/`): the only layer that holds state and talks to the
  `Host`: the app shell, the providers and the modals.
- **Components** (`src/components/`): pure rendering, props in and DOM out, in folders
  grouped by theme.
- **State** (`src/state/`): the store and its modules, grouped by theme.
- **Send pipeline** (`src/send/`): what runs before a message leaves, including the
  redaction gates and the preflight checks.
- **Agent** (`src/agent/`): the tool-calling loop.
- **Styles** (`src/styles.css`): Tailwind tokens and the light and dark themes, exported as
  `@openmasq/ui/styles.css`.

The desktop shows how the pieces fit together in
[`apps/desktop/src/renderer/src/main.tsx`](../../apps/desktop/src/renderer/src/main.tsx).

## Develop

```bash
pnpm --filter @openmasq/ui build       # tsup, into dist/
pnpm --filter @openmasq/ui typecheck
pnpm test:changed                      # from the root, after each change
pnpm test                              # from the root, before pushing
```

> [!NOTE]
> `ui` may import `llm`, `redact`, `mcp`, `catalog`, `schema`, `analytics`, `i18n` and
> `branding`, never an app. User-facing text goes through the typed catalogue (`useT()`).
> Styling uses Tailwind and the tokens in `src/styles.css`, with no inline styles.
