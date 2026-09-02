# @openmasq/ui — the whole interface

<sub>**English** · [Français](#openmasqui--toute-linterface) · [openmasq.com](https://openmasq.com)</sub>

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
  behind the Skills and Memory screens and the « Votre avis » modal.
- `src/styles.css` — tokens and the four themes.

`pnpm test:changed` after each burst; `pnpm test` before pushing.

---

# @openmasq/ui — toute l'interface

Toute l'interface React, l'état de l'application et le système de design,
**indépendants de la plateforme** : le paquet ne touche jamais directement l'OS, une base de
données ou le réseau — il les atteint par le `Host` injecté (`src/host/`), qu'`apps/desktop`
implémente.

**Frontière.** Peut importer `llm`, `redact`, `mcp`, `catalog`, `schema`, `analytics`, `i18n`.
Jamais une app. La copie passe par le catalogue typé (`useT()`) ; la structure reste dans le
code. Le style est Tailwind + les tokens de `src/styles.css` — pas de style en ligne.

**Trois étages, une règle chacun.**
- `pages/` — un dossier par écran : il le rend et recueille les décisions de l'utilisateur.
- `containers/` — l'étage autorisé à avoir de l'état et à parler au Host : la coquille, les
  providers, la famille des modales.
- `components/` — du rendu pur : des props entrent, du DOM à la marque sort. Des dossiers
  thématiques, jamais par type.

**Commencez ici.**
- `src/state/` — le store et les modules d'état (groupés par thème) ; `src/send/` — le
  pipeline d'envoi (portes de masquage, termes de coffre, préflight) ; `src/agent/` — la
  boucle d'appel d'outils.
- `src/skills/` (instructions réutilisables), `src/memory/`, `src/feedback/` — la logique
  derrière les écrans Compétences et Mémoire et la modale « Votre avis ».
- `src/styles.css` — les tokens et les quatre thèmes.

`pnpm test:changed` après chaque salve ; `pnpm test` avant de pousser.
