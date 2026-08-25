<!-- Une PR = UNE intention. Cible ≤ 400 lignes de diff ; au-delà, PR empilées. -->
<!-- Titre : conventional commit en anglais — `type(scope): observable effect`. -->
<!-- Le détail des conventions : CONTRIBUTING.md. -->

## Quoi / pourquoi

<!-- 2-3 phrases : l'intention, pas le diff paraphrasé. -->

## Vérifié

<!-- Les gates réellement passées — cocher UNIQUEMENT ce qui a tourné. -->

- [ ] `pnpm test`
- [ ] `npx tsc --noEmit` (packages touchés rebuildés depuis `dist/`)
- [ ] `pnpm check:lint` (ou `pnpm verify` en entier)
- [ ] Build de l'app (si le diff touche desktop/web/backend)
- [ ] `FEATURES.md` à jour (si écran/onglet/réglage/modale ajouté ou retiré — règle 13)

## Résiduels

<!-- Ce que la PR ne couvre PAS et qui reste ouvert. Sinon écrire : aucun. -->
