# Workflows — which ones a contributor needs

<sub>**English** · [Français](#workflows--ceux-dont-un-contributeur-a-besoin)</sub>

Two families, and the split is the trigger, not the file name.

## Contributor CI — runs on every PR and push to `dev`/`main`, needs NO secret

| Workflow | What it does |
|---|---|
| `ci.yml` | The entry point: path filter, then `verify.yml`, `corpus.yml` on engine diffs, and the features-drift notice. The one required check is the `ci` verdict. |
| `verify.yml` | `pnpm build` + the gate suite + `pnpm test` (`check:pkgtree` runs in the release workflows, `check:features-drift` in `ci.yml`). The only secrets it accepts are optional analytics keys baked as build defines — empty on a fork, which is the documented off-state. |
| `corpus.yml` | Recall/precision benches of the redaction engine on real documents. Informative, never blocking. |
| `scan.yml` | gitleaks + CodeQL. On a fork's PR the CodeQL upload has no token and degrades to analysis-only. |

**A fork with zero secrets configured is green on all four.** If one of them ever needs a
secret to pass, that is a bug in the workflow, not a setup step for the contributor.

## Release / ops — tag- or schedule-triggered, run by the maintainers

| Workflow | Trigger | Needs |
|---|---|---|
| `release.yml` | `v*` / `beta-v*` tags | Apple signing + R2 + updates-Worker token. **Every secret-dependent step is skipped with a named notice when the secret is absent**: a fork's tag builds, boot-smokes and uploads the UNSIGNED app to the run — nothing reaches a channel (`PUBLISH` in the job env is the one decision). |
| `release-windows.yml` | manual | nothing — by design (see its header). |
| `audit.yml` | weekly | nothing. `pnpm audit` sorted by shipped surface. |

The server side — API, gateway, relays, e-mails, and the workflows that probe or announce
them (`money-path`, `release-notes-*`) — lives in the private `infra` repository since
2026-08-31, together with `@openmasq/emails`.

## Rules the gate enforces (`pnpm check:actions`)

- every `uses:` is pinned to a 40-hex commit SHA with the tag in a trailing comment;
- `secrets.*` never appears in an `if:` — GitHub refuses to LOAD the workflow (0 jobs).
  Hoist a decision into the job's `env` and test that instead.

---

# Workflows — ceux dont un contributeur a besoin

Deux familles, et ce qui les sépare est le déclencheur, pas le nom du fichier.

## CI des contributions — sur chaque PR et chaque push vers `dev`/`main`, AUCUN secret requis

| Workflow | Ce qu'il fait |
|---|---|
| `ci.yml` | Le point d'entrée : filtre de chemins, puis `verify.yml`, `corpus.yml` sur les diffs du moteur, et l'avis de dérive des fonctionnalités. La seule vérification obligatoire est le verdict `ci`. |
| `verify.yml` | `pnpm build` + la suite de portes + `pnpm test` (`check:pkgtree` tourne dans les workflows de publication, `check:features-drift` dans `ci.yml`). Les seuls secrets qu'il accepte sont des clés d'analytique optionnelles cuites en défines de build — vides sur un fork, ce qui est l'état « éteint » documenté. |
| `corpus.yml` | Bancs de rappel et de précision du moteur de masquage sur de vrais documents. Informatif, jamais bloquant. |
| `scan.yml` | gitleaks + CodeQL. Sur la PR d'un fork, l'envoi CodeQL n'a pas de jeton et se dégrade en analyse seule. |

**Un fork sans aucun secret configuré est vert sur les quatre.** Si l'un d'eux venait à
exiger un secret pour passer, ce serait un bug du workflow, pas une étape d'installation
pour le contributeur.

## Publication / exploitation — déclenchés par un tag ou une planification, tenus par les mainteneurs

| Workflow | Déclencheur | Exige |
|---|---|---|
| `release.yml` | tags `v*` / `beta-v*` | La signature Apple + R2 + le jeton du Worker de mises à jour. **Chaque étape dépendante d'un secret est sautée avec un avis nommé quand le secret est absent** : le tag d'un fork construit, passe le test de démarrage et téléverse l'application NON SIGNÉE dans le run — rien n'atteint un canal (`PUBLISH` dans l'env du job est la décision unique). |
| `release-windows.yml` | manuel | rien — à dessein (voir son en-tête). |
| `audit.yml` | hebdomadaire | rien. `pnpm audit` trié par surface livrée. |

Le côté serveur — API, passerelle, relais, e-mails, et les workflows qui les sondent ou les
annoncent (`money-path`, `release-notes-*`) — vit dans le dépôt privé `infra` depuis le
2026-08-31, avec `@openmasq/emails`.

## Les règles que la porte impose (`pnpm check:actions`)

- chaque `uses:` est épinglé à un SHA de commit de 40 caractères hexadécimaux, le tag en
  commentaire de fin de ligne ;
- `secrets.*` n'apparaît jamais dans un `if:` — GitHub refuse de CHARGER le workflow
  (0 job). Remontez la décision dans l'`env` du job et testez celle-ci à la place.
