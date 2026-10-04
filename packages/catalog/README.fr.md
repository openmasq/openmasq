[English](README.md)

# @openmasq/catalog

**La source unique des listes qu'une organisation peut gouverner.**

Les modèles, les connecteurs MCP, les catégories de masquage et les drapeaux de
fonctionnalité, chacun défini une seule fois. Tout endroit qui affiche ou gouverne l'un de
ces identifiants l'importe d'ici, si bien que tous désignent les mêmes choses. Le paquet
est utilisé par `@openmasq/ui`, l'application de bureau et `apps/proxy`. C'est un paquet
interne au monorepo, non publié sur npm.

## Contenu

- **Modèles** (`@openmasq/catalog/models`) : `MODEL_CATALOG`, le registre de `@openmasq/llm`
  enrichi des prix, des fenêtres de contexte et des capacités, par identifiant.
- **Connecteurs** (`@openmasq/catalog/mcp`) : `MCP_CONNECTORS`, leurs catégories, leurs
  logos et leurs conditions de connexion, ainsi que `writeRisk`, qui évalue le risque d'un
  appel d'outil.
- **Catégories de masquage** (`@openmasq/catalog/redaction`) : `REDACTION_CATEGORIES`, leurs
  valeurs par défaut et les niveaux de protection.
- **Drapeaux de fonctionnalité** (`src/flags.ts`) : `FEATURE_ACCESS`, les sections que l'on
  peut masquer à distance. Exportés par le point d'entrée principal.

## Développement

```bash
pnpm --filter @openmasq/catalog build       # tsup, vers dist/
pnpm --filter @openmasq/catalog typecheck
pnpm test packages/catalog                  # depuis la racine
```

> [!NOTE]
> Le catalogue ne contient que des identifiants et des informations d'affichage. Une entrée
> de connecteur ne porte jamais de ligne de commande ni d'identifiants OAuth : ils restent
> dans `apps/desktop/src/main/mcp/` et `apps/mcp-broker/`.
