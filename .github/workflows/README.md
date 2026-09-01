# Workflows — which ones a contributor needs

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
| `release.yml` | `v*` / `staging-v*` tags | Apple signing + R2 + updates-Worker token. **Every secret-dependent step is skipped with a named notice when the secret is absent**: a fork's tag builds, boot-smokes and uploads the UNSIGNED app to the run — nothing reaches a channel (`PUBLISH` in the job env is the one decision). |
| `release-windows.yml` | manual | nothing — by design (see its header). |
| `audit.yml` | weekly | nothing. `pnpm audit` sorted by shipped surface. |

The server side — API, gateway, relays, e-mails, and the workflows that probe or announce
them (`money-path`, `release-notes-*`) — lives in the private `infra` repository since
2026-08-31, together with `@openmasq/emails`.

## Rules the gate enforces (`pnpm check:actions`)

- every `uses:` is pinned to a 40-hex commit SHA with the tag in a trailing comment;
- `secrets.*` never appears in an `if:` — GitHub refuses to LOAD the workflow (0 jobs).
  Hoist a decision into the job's `env` and test that instead.
