# Contributing to OpenMasq

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
