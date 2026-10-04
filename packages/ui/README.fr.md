[English](README.md)

# @openmasq/ui

**L'interface d'OpenMasq : tous les écrans, l'état de l'application et le système de design.**

Ce paquet contient tout le code React de l'application. Il n'accède jamais directement au
système d'exploitation, à une base de données ou au réseau. Il passe par un `Host` que
l'application lui fournit (`src/host/`). `apps/desktop` implémente ce `Host` et monte
l'interface ; `apps/proxy` n'utilise que l'aide au placement des infobulles
(`@openmasq/ui/tooltip`). C'est un paquet interne au monorepo, non publié sur npm.

## Contenu

- **Pages** (`src/pages/`) : un dossier par écran (conversation, bibliothèque, réglages,
  compétences, mémoire, coffre, accueil, connexion). Une page affiche son écran et recueille
  les choix de l'utilisateur.
- **Conteneurs** (`src/containers/`) : la seule couche qui détient de l'état et parle au
  `Host` : le cadre de l'application, les fournisseurs de contexte et les fenêtres modales.
- **Composants** (`src/components/`) : de l'affichage pur, des props en entrée et du DOM en
  sortie, rangés par thème.
- **État** (`src/state/`) : le store et ses modules, regroupés par thème.
- **Chaîne d'envoi** (`src/send/`) : ce qui s'exécute avant qu'un message parte, dont les
  contrôles de masquage et les vérifications préalables.
- **Agent** (`src/agent/`) : la boucle d'appel d'outils.
- **Styles** (`src/styles.css`) : les variables Tailwind et les thèmes clair et sombre,
  exportés sous `@openmasq/ui/styles.css`.

L'application de bureau montre comment ces éléments s'assemblent, dans
[`apps/desktop/src/renderer/src/main.tsx`](../../apps/desktop/src/renderer/src/main.tsx).

## Développement

```bash
pnpm --filter @openmasq/ui build       # tsup, vers dist/
pnpm --filter @openmasq/ui typecheck
pnpm test:changed                      # depuis la racine, après chaque modification
pnpm test                              # depuis la racine, avant de pousser
```

> [!NOTE]
> `ui` peut importer `llm`, `redact`, `mcp`, `catalog`, `schema`, `analytics`, `i18n` et
> `branding`, jamais une application. Les textes affichés passent par le catalogue typé
> (`useT()`). Le style repose sur Tailwind et les variables de `src/styles.css`, sans style
> en ligne.
