[English](README.md)

# @openmasq/desktop

**L'application de bureau OpenMasq, construite avec Electron.**

C'est l'application que les utilisateurs installent. Le processus de rendu monte
l'interface de `@openmasq/ui` et lui fournit un `Host`, l'objet par lequel l'interface
accède au système d'exploitation, à la base locale et au réseau. Le processus principal
fait tout ce que l'interface ne peut pas faire seule. Le paquet est interne au monorepo et
n'est pas publié sur npm.

## Contenu

- **Processus principal** (`src/main/`) : le démarrage dans `src/main/index.ts`, les
  gestionnaires IPC dans `src/main/ipc/`, la base locale et ses migrations dans
  `src/main/db/`, les connecteurs et les contrôles d'outils dans `src/main/mcp/`, le bac à
  sable Python dans `src/main/python/`.
- **Preload** (`src/preload/`) : expose l'API du processus principal à la page sous le nom
  `window.openmasq`, via `contextBridge`.
- **Rendu** (`src/renderer/`) : monte `@openmasq/ui` et implémente son `Host`, dans
  `src/renderer/src/main.tsx`.
- **Scripts de build** (`scripts/`) : `buildDefines.ts` liste les adresses de service
  qu'un build peut recevoir, sans aucune valeur par défaut dans le dépôt. L'exception est
  `publicServices.ts`, les services publics que tout build contacte tant que vous ne les
  videz pas.
- **Tests de bout en bout** (`e2e/`) : des scénarios Playwright qui pilotent l'application
  construite face à de vrais fournisseurs. Voir [`e2e/README.md`](e2e/README.md).

## Développement

À lancer depuis la racine du dépôt.

```bash
pnpm dev                                   # construit les paquets, puis lance l'application
pnpm --filter @openmasq/desktop bake       # télécharge les modèles et environnements locaux, une fois
pnpm --filter @openmasq/desktop typecheck
pnpm build
```

`pnpm dev` utilise les mêmes services publics qu'une application installée. Pour la faire
pointer vers les vôtres, placez vos valeurs dans `.env.development.local`, que git ignore.
Les variables sont listées dans `.env.development`, et
[`SELF_HOSTING.md`](../../SELF_HOSTING.md) décrit l'installation complète.

> [!WARNING]
> Les tests e2e appellent les vraies API des fournisseurs et coûtent de l'argent. Ils ne
> font pas partie de `pnpm test`, et chaque scénario s'ignore lui-même quand sa clé manque.

> [!IMPORTANT]
> Toutes les frontières de confiance du produit sont ici : les gestionnaires IPC, les
> processus enfants (`spawn`, `utilityProcess`), les sorties réseau, les secrets stockés,
> le bac à sable Python et le navigateur de l'agent. Le processus de rendu n'est pas digne
> de confiance pour les décisions de sécurité : un contrôle fait dans l'interface est refait
> dans le processus principal. Lisez la règle 7 du [`CLAUDE.md`](../../CLAUDE.md) racine
> avant de toucher à l'une d'elles.
