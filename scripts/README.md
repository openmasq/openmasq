# scripts/ — root tooling, in three families

Nothing here ships. Everything runs from the repository root.

| Folder | What | Run by |
|---|---|---|
| `checks/` | The gates — one property each (`check-*.mjs`: file size, docs paths, test inclusion, alias parity, duplication, features, i18n, dead code, pinned actions, shipped bundles, PII, retired names…) and `audit-gate.mjs`. **Each allowlist / baseline JSON sits next to the gate that reads it** — a frozen backlog that may shrink, never grow without a stated reason. `locScope.mjs` is the LOC scope shared by `check-file-size` and the pre-commit `check-staged-loc`. | `pnpm check:<name>`; the CI contract is `.github/workflows/verify.yml` |
| `vitest/` | The test-runner shims: the workspace→`src` alias (`vitest.workspaceAlias.ts`, also imported by `apps/desktop/electron.vite.config.ts` — one table for dev and tests), the Electron and Sentry stubs, the web-storage setup. | the three root `vitest.*.config.ts` |
| `tooling/` | The out-of-tree turbo cache (`turbo.mjs`), the agentic bench, the sandboxed agent session (`claude-sandbox.sh` + its test). | `pnpm dev/build/typecheck`, `pnpm bench`, `pnpm claude:sandbox` |

The three `vitest.*.config.ts` stay at the root on purpose: `check-test-include.mjs` reads
`vitest.config.ts` there, and vitest looks for it there. A new gate goes in `package.json`
`scripts` **and** in `verify.yml` — `pnpm verify` is a convenience, not the contract.
