[English](README.md)

# @openmasq/analytics

**Le cœur de mesure d'audience d'OpenMasq, respectueux de la vie privée.**

Il décide de ce qu'un événement de mesure peut contenir et du moment où il peut partir.
`@openmasq/ui` construit dessus la mesure de l'application de bureau
(`packages/ui/src/analytics/`), et le filtre Sentry de l'application reprend son
`isOperationalError`. Les événements sont uniquement manuels, sans capture automatique. Le
paquet n'a aucune dépendance et n'utilise que les objets globaux du navigateur.

## Contenu

- **Nettoyage** : `makeSanitize` retire toute clé que le vocabulaire d'événements ne déclare
  pas et remplace les nombres signalés par des tranches grossières (`src/sanitize.ts`).
- **Transport** : `createSink` envoie au relais, ou directement à PostHog en repli. Rien ne
  part sans transport configuré, sans consentement de l'utilisateur, ou si Do Not Track ou
  GPC est actif. Les événements attendent dans une courte file jusqu'à ce que le
  consentement soit connu (`src/sink.ts`).
- **Canal d'erreurs** : `captureError` envoie un événement `$exception` ; `scrubMessage`
  retire de son message les e-mails, identifiants, longs jetons, suites de chiffres et
  chemins (`src/errorTracking.ts`).
- **Drapeaux de fonctionnalités** : `fetchFlags` lit les drapeaux du relais. C'est de la
  configuration, pas de la mesure : il n'attend pas le consentement (`src/flags.ts`).
- **Vocabulaire** : `DESKTOP_EVENTS`, `VOCABULARY` et `admit()`, la règle qu'applique le
  relais. La liste que l'application utilise pour nettoyer et celle que le relais admet sont
  le même objet (`src/vocabulary/`).
- **Sites** : `createWebAnalytics`, la mécanique commune aux sites web (`src/web.ts`).

## Développer

```bash
pnpm --filter @openmasq/analytics build       # tsup → dist/, à relancer avant de compiler un consommateur
pnpm --filter @openmasq/analytics typecheck
pnpm test packages/analytics                  # depuis la racine du dépôt
```

> [!IMPORTANT]
> N'ajoutez jamais de chemin qui envoie des données brutes : le parcours de la liste
> d'autorisation est le seul point de passage. Ce qu'une version envoie, et comment le
> couper, est décrit dans le README racine, section
> [Données collectées](../../README.fr.md#données-collectées).
