# Contribuer à OpenMasq

Merci de vouloir contribuer. Ce document dit comment travailler ici sans friction : le
dépôt s'auto-vérifie beaucoup (une vingtaine de gates), et une PR qui les passe se
relit vite. Licence et conditions de contribution : voir `LICENSE`.

## Démarrer

Prérequis : **Node ≥ 20** (la CI tourne en 26), **pnpm** (`corepack enable`), et Docker
pour la stack backend locale.

```bash
pnpm install
pnpm dev                     # construit les packages puis lance l'app Electron
```

Le dev ne parle qu'à des services **locaux** (convention committée dans
`apps/desktop/.env.development`). Pour la connexion de compte et le redaction cloud :

```bash
cd apps/backend && docker compose up -d     # Postgres + GoTrue + gateway + Mailpit
pnpm --filter @openmasq/backend migrate && pnpm --filter @openmasq/backend seed
pnpm --filter @openmasq/backend dev           # → :3003
```

## La boucle de travail

```bash
pnpm test:changed      # après chaque salve d'édition — remonte le graphe depuis le diff
pnpm test:related <f>  # cibler des fichiers (sans `--`, pnpm l'avale)
pnpm test:redact       # le moteur de redaction seul (~4 s)
pnpm check:lint        # Biome lint (gaté en CI et au pré-commit)
pnpm format            # Biome format — applique-le à ton code NEUF
pnpm verify            # la suite complète des gates, à passer avant la PR
```

**Format vs lint.** Le **lint** est gaté partout (CI + pré-commit). Le **format** (Biome)
est disponible et configuré pour ton éditeur, mais il n'est **pas** imposé rétroactivement
sur tout l'arbre : le code existant est écrit dense pour tenir sous le cap de 300 lignes
(règle 1), et un reformatage global le ferait déborder. Applique `pnpm format` à ce que tu
écris ; ne reformate pas des fichiers que tu ne touches pas.

⚠️ **`pnpm test:e2e` frappe la vraie API OpenAI et coûte de l'argent réel.** Ne le
lancez jamais par curiosité ; les tests unitaires (`pnpm test`, 7 000+) sont gratuits et
couvrent l'essentiel. Les gates e2e sont derrière des variables d'env
(`apps/desktop/e2e/helpers.ts`) précisément pour ça.

## Les gates — pourquoi ça vous bloque, et comment lire le rouge

Les conventions ne sont pas demandées, elles sont **exécutées**. Chaque gate imprime la
raison de son existence quand elle échoue — lisez le message avant de contourner :

| Gate | Ce qu'elle protège |
|---|---|
| `check:lint` | Les erreurs que le typecheck ne voit pas (hook mal placé, import mort, chaînage optionnel casté), via Biome. |
| `check:loc` | Aucun fichier source > 300 lignes (dette gelée, ne peut que décroître). |
| `check:dup` | Un fait/comportement n'a qu'UNE maison — pas de copie « à garder en phase ». |
| `check:docs` | Le `CLAUDE.md` racine ne cite que des chemins qui existent. |
| `check:features` | `FEATURES.md` décrit le produit réel (écrans, réglages, compteurs). |
| `check:tests` | Tout fichier `*.test.ts` suivi est réellement exécuté par un `include`. |
| `check:brand` | L'ancien nom de code du dépôt ne réapparaît pas. |
| `check:pii` | Aucune identité réelle ne revient dans les fixtures (empreintes hachées). |
| `check:actions` | Toute GitHub Action est épinglée sur un SHA de commit. |
| `check:knip` | Le code mort ne croît pas (cliquet). |

Les invariants de fond (fail-closed, allow-list jamais deny-list, le renderer est
untrusted, la frontière modèle/extérieur du redaction) sont dans **`CLAUDE.md`** à la
racine — lisez-le avant une première modification, il est court et c'est la carte.

## Commits et pull requests

- **Une PR = UNE intention** — un bug, une feature ou un refactor, jamais deux. Le
  mécanique (renommage, déplacement, formatage) part dans sa PROPRE PR, avant le
  comportemental. Cible ≤ 400 lignes de diff ; au-delà, PR empilées.
- **Un commit = une étape cohérente, verte seule** (un `git bisect` doit pouvoir s'y
  arrêter). Pas de « wip », « oops », « fixup » dans l'historique poussé — squashez
  avant de pousser.
- **Titres en ANGLAIS, conventional commits, effet observable** :
  `type(scope): what the code does NOW`, type parmi `feat|fix|refactor|chore|docs|test`.
  Jamais « update » ni « improvements ». Le corps peut être en français ou en anglais.
- **Corps de PR : 3 blocs** (le template les porte) — *Quoi/pourquoi* (l'intention, pas
  le diff paraphrasé), *Vérifié* (les gates réellement passées), *Résiduels* (ce qui
  reste ouvert, ou « aucun »).
- **Un correctif de sécurité ne se décrit jamais** : dites ce que le code garantit
  DÉSORMAIS, jamais ce qui était exposé ni depuis quand (voir `SECURITY.md`).
- Flux : **fork → branche → PR vers `main`**. Personne ne pousse directement. Merge en
  rebase, jamais de merge-commit.

## Sécurité

Une vulnérabilité ne se signale **jamais** dans une issue publique — voir `SECURITY.md`
(flow *Security → Report a vulnerability*).
