# @openmasq/ui — the whole interface

All the React UI, the app state and the design system, **platform-agnostic**: the
package never touches the OS, a database or the network directly — it reaches them
through the injected `Host` (`src/host/`), which `apps/desktop` implements.

**Boundary.** May import `llm`, `redact`, `mcp`, `catalog`, `schema`, `analytics`,
`i18n`. Never an app. Copy goes through the typed catalogue (`useT()`); structure stays
in code. Styling is Tailwind + `src/styles.css` tokens — no inline styles.

**Three tiers, one rule each.**
- `pages/` — one folder per screen: renders it, collects the user's decisions.
- `containers/` — the tier allowed to have state and talk to the Host: the shell,
  the providers, the modal family.
- `components/` — pure render: props in, branded DOM out. Themed folders, never by type.

**Start here.**
- `src/state/` — the store and the state modules (grouped by theme); `src/send/` — the send
  pipeline (redaction gates, vault terms, preflight); `src/agent/` — the tool-calling loop.
- `src/skills/` (reusable instructions), `src/memory/`, `src/feedback/` — feature logic
  behind the Skills, Memory and « Votre avis » screens.
- `src/styles.css` — tokens and the four themes.

`pnpm test:changed` after each burst; `pnpm test` before pushing.
