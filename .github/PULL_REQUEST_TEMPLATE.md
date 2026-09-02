<!-- One PR = ONE intent. Aim for ≤ 400 lines of diff; beyond that, stack PRs.
     Une PR = UNE intention. Visez ≤ 400 lignes de diff ; au-delà, empilez les PR. -->
<!-- Title: conventional commit, in English — `type(scope): observable effect`.
     Titre : commit conventionnel, en anglais — `type(portée) : effet observable`. -->
<!-- The conventions in full / les conventions en entier : CONTRIBUTING.md. -->

## What / why · Quoi / pourquoi

<!-- 2-3 sentences: the intent, not the diff paraphrased.
     2-3 phrases : l'intention, pas la paraphrase du diff. -->

## Verified · Vérifié

<!-- The gates that actually ran — tick ONLY what you ran.
     Les portes qui ont réellement tourné — ne cochez QUE ce que vous avez lancé. -->

- [ ] `pnpm test`
- [ ] `npx tsc --noEmit` (touched packages rebuilt from `dist/` · paquets touchés reconstruits depuis `dist/`)
- [ ] `pnpm check:lint` (or the whole `pnpm verify` · ou tout `pnpm verify`)
- [ ] App build (if the diff touches desktop · si le diff touche le bureau)
- [ ] `FEATURES.md` updated (if a screen/tab/setting/modal was added or removed — rule 13 ·
      si un écran, un onglet, un réglage ou une modale a été ajouté ou retiré — règle 13)

## Residuals · Résiduels

<!-- What this PR does NOT cover and leaves open. Otherwise write: none.
     Ce que cette PR ne couvre PAS et laisse ouvert. Sinon écrivez : aucun. -->
