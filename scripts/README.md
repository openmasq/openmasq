# scripts/ — root tooling, in three families

<sub>**English** · [Français](#scripts--loutillage-de-la-racine-en-trois-familles)</sub>

Nothing here ships. Everything runs from the repository root.

| Folder | What | Run by |
|---|---|---|
| `checks/` | The gates — one property each (`check-*.mjs`: file size, docs paths, test inclusion, alias parity, duplication, features, i18n, dead code, pinned actions, shipped bundles, PII, retired names…) and `audit-gate.mjs`. **Each allowlist / baseline JSON sits next to the gate that reads it** — a frozen backlog that may shrink, never grow without a stated reason. `locScope.mjs` is the LOC scope shared by `check-file-size` and the pre-commit `check-staged-loc`. | `pnpm check:<name>`; the CI contract is `.github/workflows/verify.yml` |
| `vitest/` | The test-runner shims: the workspace→`src` alias (`vitest.workspaceAlias.ts`, also imported by `apps/desktop/electron.vite.config.ts` — one table for dev and tests), the Electron and Sentry stubs, the web-storage setup. | the three root `vitest.*.config.ts` |
| `tooling/` | The out-of-tree turbo cache (`turbo.mjs`), the agentic bench, the sandboxed agent session (`claude-sandbox.sh` + its test). | `pnpm dev/build/typecheck`, `pnpm bench`, `pnpm claude:sandbox` |

The three `vitest.*.config.ts` stay at the root on purpose: `check-test-include.mjs` reads
`vitest.config.ts` there, and vitest looks for it there. A new gate goes in `package.json`
`scripts` **and** in `verify.yml` — `pnpm verify` is a convenience, not the contract.

---

# scripts/ — l'outillage de la racine, en trois familles

Rien ici ne part avec le produit. Tout se lance depuis la racine du dépôt.

| Dossier | Quoi | Lancé par |
|---|---|---|
| `checks/` | Les portes — une propriété chacune (`check-*.mjs` : taille de fichier, chemins de docs, inclusion des tests, parité des alias, duplication, fonctionnalités, i18n, code mort, actions épinglées, bundles livrés, données personnelles, noms retirés…) et `audit-gate.mjs`. **Chaque JSON de liste d'autorisation ou de référence est posé à côté de la porte qui le lit** — un arriéré gelé qui peut rétrécir, jamais grandir sans raison énoncée. `locScope.mjs` est la portée LOC partagée par `check-file-size` et le `check-staged-loc` de pre-commit. | `pnpm check:<nom>` ; le contrat de la CI est `.github/workflows/verify.yml` |
| `vitest/` | Les cales du lanceur de tests : l'alias workspace→`src` (`vitest.workspaceAlias.ts`, importé aussi par `apps/desktop/electron.vite.config.ts` — une seule table pour le dev et les tests), les bouchons Electron et Sentry, la mise en place du stockage web. | les trois `vitest.*.config.ts` de la racine |
| `tooling/` | Le cache turbo hors de l'arbre (`turbo.mjs`), le banc agentique, la session d'agent en bac à sable (`claude-sandbox.sh` et son test). | `pnpm dev/build/typecheck`, `pnpm bench`, `pnpm claude:sandbox` |

Les trois `vitest.*.config.ts` restent à la racine à dessein : `check-test-include.mjs` y lit
`vitest.config.ts`, et vitest l'y cherche. Une nouvelle porte va dans les `scripts` de
`package.json` **et** dans `verify.yml` — `pnpm verify` est une commodité, pas le contrat.
