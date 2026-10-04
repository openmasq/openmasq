[English](README.md)

# @openmasq/branding

**L'unique emplacement des valeurs de la marque OpenMasq.**

`branding.json` contient le nom du produit, son identifiant court, les domaines, le schéma
de lien profond, l'identifiant d'application, l'hôte Sentry, l'organisation Hugging Face
et l'adresse du support. Toute valeur qui atteint l'exécution, le réseau ou le disque en
découle. L'application de bureau, le proxy local et la plupart des paquets (`ui`, `llm`,
`mcp`, `catalog`, `connectors`, `sync`, `updates-manifest`) l'importent. La configuration
de compilation (`apps/desktop/electron.vite.config.ts`) et les scripts de vérification lisent
directement le fichier JSON.

## Contenu

- **`BRAND`** : le contenu de `branding.json`, typé `BrandConfig`.
- **`brandHost(sub?)`** : `brandHost("app")` donne `app.openmasq.com`.
- **`brandUrl(sub?, path?)`** : `brandUrl("app", "/invite")` donne
  `https://app.openmasq.com/invite`.
- **`brandKey(suffix)`** : une clé préfixée par l'identifiant court, `brandKey("device-id")`
  donne `openmasq-device-id`.
- **`brandHeader(suffix)`** : un nom d'en-tête HTTP, `brandHeader("sig")` donne
  `x-openmasq-sig`.
- **`@openmasq/branding/branding.json`** : le fichier brut, exporté comme sous-chemin.

## Développer

```bash
pnpm --filter @openmasq/branding build       # tsup → dist/
pnpm --filter @openmasq/branding typecheck
pnpm check:brand                             # échoue si un ancien nom de la marque réapparaît
```

> [!WARNING]
> Beaucoup de ces valeurs sont stockées sur les machines installées ou envoyées sur le
> réseau : clés de stockage, en-têtes signés, schéma de lien profond, identifiant
> d'application, domaines appelés par les clients déjà livrés. En changer une renomme le
> produit et rompt la compatibilité avec les installations existantes.
