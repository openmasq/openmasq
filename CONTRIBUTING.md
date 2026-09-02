# Contributing to OpenMasq

<sub>**English** · [Français](#contribuer-à-openmasq)</sub>

Thanks for wanting to contribute. This document says how to work here without friction:
the repository checks itself a great deal (seventeen `check:*` gates), and a pull request that
passes them is quick to review.

The project is under the [Apache License 2.0](LICENSE). By opening a pull request you
submit your contribution under that same licence — section 5 of the licence says so, and
there is no separate agreement to sign.

## Getting started

Prerequisites: **Node ≥ 20** (CI runs 26) and **pnpm** (`corepack enable`). No server, no
Docker: the app runs on its own.

```bash
pnpm install
pnpm dev                     # builds the packages, then launches the Electron app

# On-device models — NOT part of `dev` or `build`, and worth knowing about:
pnpm --filter @openmasq/desktop bake   # CPython, NER weights, OCR data, embeddings
```

⚠️ **Without `bake`, local NER and OCR are unavailable and redaction falls back to the
deterministic pattern rules.** The app still runs, and nothing warns you — so if you are
touching detection, run `bake` first or you will be measuring the regex floor rather than
the product. Each asset is sha256-pinned; a source that cannot be reached skips with a
warning (except the NER weights, which fail the bake rather than ship an empty model).


Dev reaches the same five hosted services as a build — sign-in, the Slack relay, the
analytics relay, the releases feed, Sentry (`apps/desktop/scripts/publicServices.ts`) —
with no local value by default; set a variable empty to run without one. The app runs
with no backend at all: paste a provider key or point it at a local model. A local stack
is an explicit choice: `apps/desktop/.env.development` says which overrides go in your
gitignored `.env.development.local`.

## The working loop

```bash
pnpm test:changed      # after each burst of edits — walks the graph from the diff
pnpm test:related <f>  # target files (no `--`, pnpm swallows it)
pnpm test:redact       # the redaction engine alone (~4 s)
pnpm check:lint        # Biome lint (gated in CI and at pre-commit)
pnpm format            # Biome format — apply it to the code you WRITE
pnpm verify            # the full gate suite, to pass before opening a PR
```

**Format vs lint.** **Lint** is gated everywhere (CI + pre-commit). **Format** (Biome) is
available and configured for your editor, but it is **not** enforced retroactively over
the whole tree: existing code is written dense to stay under the 300-line cap (rule 1),
and a global reformat would push it over. Run `pnpm format` on what you write; do not
reformat files you are not touching.

⚠️ **The e2e suites hit real provider APIs and cost real money.** Never run one out of
curiosity; the unit tests (`pnpm test`) are free and cover the essentials. Each e2e spec
SKIPS itself when its provider key is absent (`test.skip` at the top of the file), and they
are launched one at a time: `pnpm --filter @openmasq/desktop e2e:openai`, `e2e:workflows`…
(`apps/desktop/e2e/README.md`).

## The gates — why they block you, and how to read the red

Conventions here are not asked for, they are **enforced**. Each gate prints the reason it
exists when it fails — read the message before working around it:

| Gate | What it protects |
|---|---|
| `check:lint` | The errors typechecking cannot see (misplaced hook, dead import, cast optional chain), via Biome. |
| `check:loc` | No source file over 300 lines (frozen debt, may only shrink). |
| `check:dup` | A fact or a behaviour has ONE home — never a second copy that a comment promises to keep aligned. |
| `check:docs` | The root `CLAUDE.md` cites only paths that exist, and does not grow past its frozen size. ⚠️ The nested guides are gitignored — the gate does not see them. |
| `check:i18n` | No copy hardcoded in a component: it belongs in `@openmasq/i18n` (accent-blind ratchet). |
| `check:alias` | The workspace→`src` alias table and the `tsconfig` copy of it agree. |
| `check:effects` | A `useEffect` that subscribes returns its cleanup. |
| `check:shipped` | What the bundles ship matches what the packaging expects. |
| `check:pkgtree` | The packaged app's flattened `node_modules` resolves the versions the build meant (release only). |
| `check:features` | `FEATURES.md` describes the real product (screens, settings, counters). |
| `check:tests` | Every tracked `*.test.ts` file is actually run by an `include`. |
| `check:brand` | The repository's retired codename does not come back. |
| `check:pii` | No real identity returns in the fixtures (hashed fingerprints). |
| `check:actions` | Every GitHub Action is pinned to a commit SHA. |
| `check:knip` | Dead code does not grow (ratchet). |

The deeper invariants — fail closed, allow-list never deny-list, the renderer is
untrusted, the model/outside boundary of redaction — are in **`CLAUDE.md`** at the root.
Read it before a first change: it is short, and it is the map.

## Commits and pull requests

- **One PR = ONE intent** — a bug, a feature or a refactor, never two. The mechanical part
  (rename, move, format) goes in its OWN PR, before the behavioural one. Aim for ≤ 400
  lines of diff; beyond that, stack PRs.
- **One commit = one coherent step, green on its own** (a `git bisect` must be able to stop
  there). No "wip", "oops" or "fixup" in pushed history — squash before you push.
- **Titles in ENGLISH, conventional commits, observable effect**:
  `type(scope): what the code does NOW`, with type among
  `feat|fix|refactor|chore|docs|test`. Never "update" nor "improvements".
- **PR body: 3 blocks** (the template carries them) — *What/why* (the intent, not the diff
  paraphrased), *Verified* (the gates you actually ran), *Residuals* (what stays open, or
  "none").
- **A security fix is never described**: say what the code guarantees NOW, never what was
  exposed nor since when (see `SECURITY.md`).
- Flow: **fork → branch → PR against `dev`** (the default branch; `main` is the release line). Nobody pushes directly. Rebase merges, never
  a merge commit.

## Security

A vulnerability is **never** reported in a public issue — see `SECURITY.md` (the
*Security → Report a vulnerability* flow).


---

# Contribuer à OpenMasq

Merci d'avoir envie de contribuer. Ce document dit comment travailler ici sans friction :
le dépôt se contrôle lui-même beaucoup (dix-sept portes `check:*`), et une pull request qui
les passe se relit vite.

Le projet est sous [licence Apache 2.0](LICENSE). En ouvrant une pull request vous soumettez
votre contribution sous cette même licence — la section 5 de la licence le dit, et il n'y a
aucun accord séparé à signer.

## Démarrer

Prérequis : **Node ≥ 20** (la CI tourne en 26) et **pnpm** (`corepack enable`). Pas de
serveur, pas de Docker : l'app tourne seule.

```bash
pnpm install
pnpm dev                     # construit les paquets, puis lance l'application Electron

# Les modèles embarqués — ils ne font partie NI de `dev` NI de `build`, et il faut le savoir :
pnpm --filter @openmasq/desktop bake   # CPython, poids NER, données OCR, embeddings
```

⚠️ **Sans `bake`, le NER et l'OCR locaux sont indisponibles et le masquage retombe sur les
règles à motifs déterministes.** L'app tourne quand même, et rien ne vous prévient — donc si
vous touchez à la détection, lancez `bake` d'abord, sinon vous mesurerez le plancher des
expressions régulières et non le produit. Chaque ressource est épinglée en sha256 ; une
source injoignable est sautée avec un avertissement (sauf les poids NER, qui font échouer le
bake plutôt que de livrer un modèle vide).

Le dev atteint les cinq mêmes services hébergés qu'un build — connexion, relais Slack, relais
analytics, flux de versions, Sentry (`apps/desktop/scripts/publicServices.ts`) — sans aucune
valeur locale par défaut ; posez une variable vide pour tourner sans l'un d'eux. L'app tourne
sans le moindre backend : collez une clé de fournisseur ou pointez-la sur un modèle local.
Une pile locale est un choix explicite : `apps/desktop/.env.development` dit quelles
surcharges mettre dans votre `.env.development.local` ignoré par git.

## La boucle de travail

```bash
pnpm test:changed      # après chaque salve d'édits — remonte le graphe depuis le diff
pnpm test:related <f>  # cibler des fichiers (pas de `--`, pnpm l'avale)
pnpm test:redact       # le moteur de masquage seul (~4 s)
pnpm check:lint        # lint Biome (tenu en CI et au pre-commit)
pnpm format            # format Biome — à appliquer au code que vous ÉCRIVEZ
pnpm verify            # toute la série de portes, à passer avant d'ouvrir une PR
```

**Format contre lint.** Le **lint** est tenu partout (CI + pre-commit). Le **format**
(Biome) est disponible et configuré pour votre éditeur, mais il n'est **pas** imposé
rétroactivement à tout l'arbre : le code existant est écrit dense pour rester sous le
plafond de 300 lignes (règle 1), et un reformatage global le ferait déborder. Lancez
`pnpm format` sur ce que vous écrivez ; ne reformatez pas des fichiers que vous ne touchez pas.

⚠️ **Les suites e2e tapent de vraies API de fournisseurs et coûtent de l'argent.** N'en
lancez jamais une par curiosité ; les tests unitaires (`pnpm test`) sont gratuits et
couvrent l'essentiel. Chaque spec e2e SE SAUTE d'elle-même quand la clé de son fournisseur
est absente (`test.skip` en tête de fichier), et elles se lancent une par une :
`pnpm --filter @openmasq/desktop e2e:openai`, `e2e:workflows`…
(`apps/desktop/e2e/README.md`).

## Les portes — pourquoi elles vous bloquent, et comment lire le rouge

Ici les conventions ne sont pas demandées, elles sont **tenues**. Chaque porte imprime la
raison de son existence quand elle échoue — lisez le message avant de la contourner :

| Porte | Ce qu'elle protège |
|---|---|
| `check:lint` | Les erreurs que le typage ne voit pas (hook mal placé, import mort, chaînage optionnel casté), via Biome. |
| `check:loc` | Aucun fichier source au-dessus de 300 lignes (dette gelée, qui ne peut que diminuer). |
| `check:dup` | Un fait ou un comportement a UNE maison — jamais une seconde copie qu'un commentaire promet de tenir alignée. |
| `check:docs` | Le `CLAUDE.md` racine ne cite que des chemins existants, et ne dépasse pas sa taille gelée. ⚠️ Les guides imbriqués sont ignorés par git — la porte ne les voit pas. |
| `check:i18n` | Aucune formulation codée en dur dans un composant : elle appartient à `@openmasq/i18n` (cliquet insensible aux accents). |
| `check:alias` | La table d'alias workspace→`src` et sa copie dans `tsconfig` s'accordent. |
| `check:effects` | Un `useEffect` qui s'abonne rend son nettoyage. |
| `check:shipped` | Ce que les bundles expédient correspond à ce que l'empaquetage attend. |
| `check:pkgtree` | Le `node_modules` aplati de l'app empaquetée résout les versions que le build visait (release seulement). |
| `check:features` | `FEATURES.md` décrit le vrai produit (écrans, réglages, compteurs). |
| `check:tests` | Chaque `*.test.ts` suivi est réellement exécuté par un `include`. |
| `check:brand` | Le nom de code retiré du dépôt ne revient pas. |
| `check:pii` | Aucune identité réelle ne revient dans les fixtures (empreintes hachées). |
| `check:actions` | Chaque GitHub Action est épinglée à un SHA de commit. |
| `check:knip` | Le code mort n'augmente pas (cliquet). |

Les invariants plus profonds — échouer fermé, liste d'autorisation jamais liste
d'interdiction, le renderer n'est pas digne de confiance, la frontière modèle/extérieur du
masquage — sont dans le **`CLAUDE.md`** de la racine. Lisez-le avant une première
modification : il est court, et c'est la carte.

## Commits et pull requests

- **Une PR = UNE intention** — un bug, une fonctionnalité ou un refactor, jamais deux. La
  part mécanique (renommage, déplacement, formatage) part dans sa PROPRE PR, avant celle qui
  change le comportement. Visez ≤ 400 lignes de diff ; au-delà, empilez les PR.
- **Un commit = une étape cohérente, verte seule** (un `git bisect` doit pouvoir s'y
  arrêter). Aucun « wip », « oops » ou « fixup » dans l'historique poussé — écrasez avant de
  pousser.
- **Titres en ANGLAIS, conventional commits, effet observable** :
  `type(scope): ce que le code fait MAINTENANT`, avec un type parmi
  `feat|fix|refactor|chore|docs|test`. Jamais « update » ni « improvements ».
- **Corps de PR : 3 blocs** (le gabarit les porte) — *Quoi/pourquoi* (l'intention, pas le
  diff paraphrasé), *Vérifié* (les portes réellement passées), *Résiduels* (ce qui reste
  ouvert, ou « aucun »).
- **Un correctif de sécurité ne se décrit jamais** : dites ce que le code garantit
  MAINTENANT, jamais ce qui était exposé ni depuis quand (voir `SECURITY.md`).
- Circuit : **fork → branche → PR contre `dev`** (la branche par défaut ; `main` est la
  ligne de release). Personne ne pousse directement. Fusions en rebase, jamais un commit de
  merge.

## Sécurité

Une faille ne se signale **jamais** dans une issue publique — voir `SECURITY.md` (le
parcours *Security → Report a vulnerability*).
