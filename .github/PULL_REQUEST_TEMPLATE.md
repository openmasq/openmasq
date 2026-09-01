<!-- One PR = ONE intent. Aim for ≤ 400 lines of diff; beyond that, stack PRs. -->
<!-- Title: conventional commit, in English — `type(scope): observable effect`. -->
<!-- The conventions in full: CONTRIBUTING.md. -->

## What / why

<!-- 2-3 sentences: the intent, not the diff paraphrased. -->

## Verified

<!-- The gates that actually ran — tick ONLY what you ran. -->

- [ ] `pnpm test`
- [ ] `npx tsc --noEmit` (touched packages rebuilt from `dist/`)
- [ ] `pnpm check:lint` (or the whole `pnpm verify`)
- [ ] App build (if the diff touches desktop)
- [ ] `FEATURES.md` updated (if a screen/tab/setting/modal was added or removed — rule 13)

## Residuals

<!-- What this PR does NOT cover and leaves open. Otherwise write: none. -->
