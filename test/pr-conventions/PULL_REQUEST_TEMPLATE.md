<!-- ⚠️ BROUILLON NON APPLIQUÉ — destination réelle : .github/PULL_REQUEST_TEMPLATE.md -->
<!-- Une PR = UNE intention. Cible ≤ 400 lignes de diff ; au-delà, PR empilées. -->
<!-- Titre : type(scope): effet observable, en français. -->

## Quoi / pourquoi

<!-- 2-3 phrases : l'intention, pas le diff paraphrasé. -->

## Vérifié

<!-- Les gates réellement passées — cocher UNIQUEMENT ce qui a tourné. -->

- [ ] `pnpm test`
- [ ] `npx tsc --noEmit` (packages touchés rebuildés depuis `dist/`)
- [ ] Build de l'app (si le diff touche desktop/web/backend)
- [ ] Centre d'aide à jour (si le comportement produit change — règle 8)
- [ ] `FEATURES.md` à jour (si écran/onglet/réglage/modale ajouté ou retiré — règle 13)

## Résiduels

<!-- Ce que la PR ne couvre PAS et qui reste ouvert. Sinon écrire : aucun. -->
