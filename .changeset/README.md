# Changesets — versioning `@openmasq/redact`

<sub>**English** · [Français](#changesets--versionner-openmasqredact)</sub>

Only `@openmasq/redact` is published; every other workspace package is private and ignored.
The apps consume redact through `workspace:*`, so a change reaches them at once — a version
only matters to consumers outside this repository.

1. **In the PR that changes the engine's public behaviour:** `pnpm changeset` → pick
   `@openmasq/redact`, the bump (patch / minor / major) and one line for the changelog.
   An internal refactor needs no changeset.
2. **To cut a release:** `pnpm changeset version` consumes the pending changesets, bumps
   `packages/redact/package.json` and writes `packages/redact/CHANGELOG.md`. Review, merge.
3. **To publish:** run the `publish-redact` workflow (Actions tab), first with `dry_run`
   on, then off. It publishes the version in `package.json` with provenance, through npm
   trusted publishing (no token), and tags `redact-v<version>`.

While the version is `0.x`, a minor may break the API — say so in the changeset.

---

# Changesets — versionner `@openmasq/redact`

Seul `@openmasq/redact` est publié ; tous les autres paquets du workspace sont privés et ignorés.
Les applications consomment redact via `workspace:*` : un changement les atteint aussitôt — une
version ne compte que pour les consommateurs hors de ce dépôt.

1. **Dans la PR qui change le comportement public du moteur :** `pnpm changeset` → choisir
   `@openmasq/redact`, le niveau (patch / minor / major) et une ligne pour le changelog.
   Un refactor interne n'a pas besoin de changeset.
2. **Pour préparer une version :** `pnpm changeset version` consomme les changesets en attente,
   monte `packages/redact/package.json` et écrit `packages/redact/CHANGELOG.md`. Relire, fusionner.
3. **Pour publier :** lancer le workflow `publish-redact` (onglet Actions), d'abord avec
   `dry_run` coché, puis décoché. Il publie la version de `package.json` avec provenance, via le
   trusted publishing npm (aucun jeton), et pose le tag `redact-v<version>`.

Tant que la version est en `0.x`, une minor peut casser l'API — le dire dans le changeset.
