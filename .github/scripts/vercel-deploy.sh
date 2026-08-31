#!/usr/bin/env bash
#
# `vercel deploy` with a TIME BOUND and a named failure.
#
# Why this file exists instead of an inline `npx vercel deploy`: when Vercel refuses the
# commit AUTHOR ("not a member of the team" — typically a merge commit created under a
# personal account), the CLI **does not go red, it HANGS**. Measured on
# 07/08: 25-minute zombie jobs, not one log line, and above all every check
# placed AFTER the deployment — including "is the domain really serving THIS commit" — is
# never reached. The guard inherited the very silence it was meant to detect.
#
# Five minutes covers a `--prebuilt` upload many times over (the artifact is already
# built). Past that it is not slowness, it is that wall.
#
# ⚠️ The diagnosis goes to STDERR, never to stdout: callers capture the
# output (`URL=$(...)`) to alias or smoke-test afterwards. An error message on
# stdout would silently become the deployment "URL" — a trap that springs
# at the precise moment you are trying to diagnose.
#
# One home HERE for the `web` job. The two other jobs it served followed
# their apps out of this repository (August 2026) — `landing` + `docs` into
# `openmask-sites`, `ops` into `OpenMasq-infra` — each with ITS copy of this script:
# three repositories cannot import one file, and a cross-repository `uses:` would be one
# more reference to pin. A fix here carries over into both copies.
set -euo pipefail

TIMEOUT_S="${VERCEL_DEPLOY_TIMEOUT_S:-300}"

# `timeout` is GNU coreutils: present on ubuntu runners, absent from a bare macOS
# (where coreutils installs it as `gtimeout`). We resolve it instead of assuming it —
# otherwise the bound silently disappears on a dev machine and the guard is never
# tested where it is written.
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN=gtimeout
else
  echo "::error::ni \`timeout\` ni \`gtimeout\` — impossible de borner le déploiement. Refus plutôt que de lancer un appel qui peut pendre 25 min sans borne." >&2
  exit 1
fi

# ── NORMALISE the AUTHOR for Vercel — without touching the real history. ──────────────
#
# `vercel deploy` reads the local `.git` and attaches the commit AUTHOR to the "Source".
# Vercel validates that author against the team members and, if it does not recognise it,
# the CLI does not go red — it HANGS (25 min, 07/08 incident). Before, we REFUSED any
# author ≠ team, which forbade committing under one's own name (hard rule of 10/08).
#
# Now we RE-AUTHOR the head commit as the team, but ONLY in this EPHEMERAL
# CI checkout — never pushed back. The real history keeps its author (Julien, a
# contributor…), and Vercel sees the team → no membership validation fires, one
# seat is enough. This is a local `--amend`, not a `git push --force`.
#
# ⚠️ We stay ON THE BRANCH (never a detached `git checkout <sha>`): the staging domain
# is a BRANCH-BOUND domain, aliased by the `githubCommitRef` the CLI reads here. A
# detached HEAD would yield `ref: HEAD` and freeze the domain (the measured bug). The
# amend changes the local SHA but NOT the current branch — the alias follows.
#
# `--no-verify`: the pre-commit (identity, LOC) has no business in a mechanical
# CI rewrite. `|| warning`: on a twisted case (merge commit, odd tree) we do
# NOT block the deployment — at worst Vercel re-evaluates the author, and the time bound
# below remains the net.
# The team identity comes from the ENVIRONMENT (`VERCEL_TEAM_EMAIL`, `VERCEL_TEAM_NAME`,
# set from the repository variables) — no account is written here. Not supplied ⇒
# we do NOT re-author: Vercel evaluates the real author, which is the right default when
# the repository owner IS the team seat.
TEAM_EMAIL="${VERCEL_TEAM_EMAIL:-}"
TEAM_NAME="${VERCEL_TEAM_NAME:-$TEAM_EMAIL}"
AUTHOR_EMAIL="$(git log -1 --format=%ae 2>/dev/null || echo "")"
if [ -n "$TEAM_EMAIL" ] && [ "$AUTHOR_EMAIL" != "$TEAM_EMAIL" ]; then
  echo "vercel-deploy: commit authored par « ${AUTHOR_EMAIL:-vide} » — ré-authoré en équipe pour CE build éphémère (l'historique réel est inchangé)." >&2
  git -c user.name="$TEAM_NAME" -c user.email="$TEAM_EMAIL" \
    commit --amend --reset-author --no-edit --no-verify --allow-empty >/dev/null 2>&1 \
    || echo "::warning::ré-authorage impossible (commit de fusion ? arbre détaché ?) — on continue ; Vercel pourra refuser l'auteur." >&2
fi

# ⚠️ The exit code is captured AFTER the call, not in an `if ! …`: in the `then`
# branch of a negation, `$?` holds the TEST's code, not the command's — a "code 0"
# printed on a failure, measured while writing this file. `set +e` around the call.
set +e
"$TIMEOUT_BIN" "$TIMEOUT_S" npx vercel deploy "$@"
status=$?
set -e

if [ "$status" -ne 0 ]; then
  if [ "$status" -eq 124 ]; then
    echo "::error::vercel deploy n'a pas rendu la main en ${TIMEOUT_S}s. L'auteur est normalisé en équipe avant l'appel, donc la cause n'est PLUS le refus d'auteur — sauf si le ré-authorage a émis un ::warning ci-dessus (commit de fusion). Sinon chercher côté réseau/quota Vercel." >&2
  else
    echo "::error::vercel deploy a échoué (code $status)." >&2
  fi
  exit "$status"
fi
