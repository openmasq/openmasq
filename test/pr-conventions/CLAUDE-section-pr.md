# Brouillon — section « Pull requests » pour le CLAUDE.md racine

> ⚠️ BROUILLON NON APPLIQUÉ. Ce fichier vit dans `test/` exprès : rien ne le charge,
> rien ne l'applique. À coller dans le CLAUDE.md racine (section Conventions) si adopté,
> puis supprimer ce dossier.

## Pull requests

- **Une PR = UNE intention.** Un bug, une feature, ou un refactor — jamais deux. Un
  refactor mécanique (renommage, déplacement, split de fichier) part dans sa PROPRE PR,
  avant celle qui change le comportement : un diff mixte est irrelisible.
- **Cible ≤ 400 lignes de diff.** Au-delà, découper en PR empilées (chacune verte et
  mergeable seule). Exception : un déplacement pur de fichiers (le reviewer lit le
  `git log --follow`, pas le diff) — le dire dans le corps.
- **Le split des commits suit le même principe : un commit = UNE étape cohérente,
  verte seule.** Chaque commit compile et passe les tests (un `git bisect` doit pouvoir
  s'arrêter dessus) ; le mécanique (renommage, déplacement, formatage) se commite SÉPARÉMENT
  du comportemental, même à l'intérieur d'une PR ; un fix découvert en route ne s'écrase pas
  dans le commit de la feature — commit à part, avec son propre message. Jamais de
  « fixup », « oops », « wip » dans l'historique poussé : on squash AVANT de pousser,
  pas dans l'historique.
- **Titre = conventional commit, en ANGLAIS, effet observable** (règle dure des
  Conventions : l'historique d'un dépôt public se lit sans le français) :
  `type(scope): ce que l'utilisateur/le code fait DÉSORMAIS`. Le type parmi
  `feat|fix|refactor|chore|docs|test`. Jamais « update », « improvements », « WIP ».
- **Aucune trace d'outil dans le corps ni dans un trailer** — même règle dure : une PR
  est signée par l'humain qui en répond.
- **Corps normalisé, 3 blocs, court** (portés par `.github/PULL_REQUEST_TEMPLATE.md`) :
  1. *Quoi / pourquoi* — 2-3 phrases : l'intention, pas le diff paraphrasé.
  2. *Vérifié* — les gates réellement passées (`pnpm test`, build, typecheck), pas « ça marche ».
  3. *Résiduels* — ce que la PR ne couvre PAS et qui reste ouvert, ou « aucun ».
- **Sécurité : la propriété tenue, jamais l'exposition** — même règle que les commits
  (voir « ⛔ Un correctif de sécurité ne se DÉCRIT jamais »).
- Merge vers `main` : `--rebase`, jamais merge-commit (l'auteur deviendrait le compte perso).
