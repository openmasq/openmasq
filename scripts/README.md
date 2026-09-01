# scripts/ — what each family is

Everything here runs from the repository root; none of it ships. Four families share
the folder, told apart by name because several gates locate their allowlist as a
SIBLING file and `knip.json` / `vitest.config.ts` glob this level — moving a file means
touching those too (`check-file-size.mjs`, `check-docs.mjs`, `check-knip.mjs`,
`check-alias-parity.mjs`, `locScope.mjs`, `vitest.workspaceAlias.ts`).

| Family | Files | Run by |
|---|---|---|
| **Gates** (`check-*.mjs`, `audit-gate.mjs`) | one property each — file size, docs paths, test inclusion, alias parity, duplication, features, i18n, dead code, pinned actions, shipped bundles, PII, retired names… | `pnpm check:<name>`; the CI contract is `.github/workflows/verify.yml` |
| **Allowlists / baselines** (`*-allowlist.json`, `knip-baseline.json`) | the frozen backlog a gate ratchets down — may shrink, never grow without a stated reason | read by the gate of the same name, as a sibling |
| **vitest shims** (`vitest.*.ts`, `locScope.mjs`) | the workspace→`src` alias, the Electron and Sentry stubs, the web-storage setup, the shared LOC scope | imported by the three root `vitest.*.config.ts` and by `apps/desktop/electron.vite.config.ts` |
| **Tooling** (`turbo.mjs`, `bench-agentic.ts`, `claude-sandbox.*`, `parcours-agent/`) | the out-of-tree turbo cache, the agentic bench, the sandboxed agent session, the autonomous QA session (macOS launchd; French-named — an operator tool, not a contributor one) | `pnpm dev/build`, `pnpm bench`, `pnpm claude:sandbox`, by hand |

A new gate goes in `package.json` `scripts` **and** in `verify.yml` — `pnpm verify` is a
convenience, not the contract.
