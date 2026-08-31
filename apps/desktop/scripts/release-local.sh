#!/usr/bin/env bash
# STAGING desktop deployment from a workstation — the EXACT MIRROR of release.yml.
#
# One rule: every VITE_* baked here carries the SAME value as in CI, resolved from the
# SAME source. The GitHub variables (public) are read LIVE through `gh` — if CI
# changes a URL, this script follows with no edit; a variable absent in CI bakes EMPTY
# here too (the app's embedded fallback is the same on both sides). The secrets
# come from their local homes: the root `.env` (Apple signing, R2, Vercel bypass)
# and the environment (`OPENMASQ_UPDATES_ADMIN_TOKEN`, `OPENMASQ_ANALYTICS_APP_KEY`) —
# the same values as those pushed into GitHub Actions.
#
# Version: `X.Y.Z-staging.A.B` — above the channel's last build, BELOW the
# next CI run (A+1): local builds slot in without ever colliding
# with CI's `-staging.<run_number>` numbering.
#
# Steps = release.yml: build (VITE_* baked, check-bundle gate included) → bake
# (sha256) → electron-builder sign+notarize → check:pkgtree → publish (artifacts
# first, Worker registration LAST — the channel never sees an intermediate
# state).
set -euo pipefail

DESKTOP="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$DESKTOP/../.." && pwd)"
REPO="tgaudibert/openmasq"
CHANNEL="desktop-staging"
# The brand has one home (rule 9): the domain comes from packages/branding.
BRAND_DOMAIN="$(node -p "require('$ROOT/packages/branding/branding.json').domain")"
UPDATES_URL="${UPDATES_URL:-https://updates.$BRAND_DOMAIN}"

# ── The tree must be COMMITTED — CI builds a commit, never a work in progress ──
# This is the last local/CI gap, and the most insidious: a deployment started while
# another session is editing ships half-done work (lived: a type mid-refactor
# broke the build; had it compiled, it would have SHIPPED).
# OPENMASQ_RELEASE_DIRTY=1 to override knowingly.
if [ -z "${OPENMASQ_RELEASE_DIRTY:-}" ] && [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]; then
  echo "✗ arbre de travail modifié — committe (ou OPENMASQ_RELEASE_DIRTY=1) :"
  git -C "$ROOT" status --porcelain --untracked-files=no | head -10
  exit 1
fi

# ── Local secrets ────────────────────────────────────────────────────────────
set -a; source "$ROOT/.env"; set +a
export CSC_LINK="$MAC_CSC_LINK" CSC_KEY_PASSWORD="$MAC_CSC_KEY_PASSWORD"
export R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-$R2_SECRET_KEY_ID}"
# The infra no longer lives in this repository: both secrets come from the environment.
UPDATES_ADMIN_TOKEN="${OPENMASQ_UPDATES_ADMIN_TOKEN:-}"
ANALYTICS_APP_KEY="${OPENMASQ_ANALYTICS_APP_KEY:-}"
[ -n "$UPDATES_ADMIN_TOKEN" ] || { echo "✗ OPENMASQ_UPDATES_ADMIN_TOKEN manquant (export-le avant de lancer)"; exit 1; }
[ -n "$ANALYTICS_APP_KEY" ] || { echo "✗ OPENMASQ_ANALYTICS_APP_KEY manquant (export-le avant de lancer)"; exit 1; }
for v in CSC_LINK CSC_KEY_PASSWORD APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID \
         R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY \
         VERCEL_AUTOMATION_BYPASS_SECRET; do
  [ -n "${!v:-}" ] || { echo "✗ $v manquant (.env racine)"; exit 1; }
done

# ── CI variables, read live (strict parity, ABSENCE included) ────────────────
ghvar() { gh api "repos/$REPO/actions/variables/$1" --jq .value 2>/dev/null || true; }
ANALYTICS_RELAY_URL="$(ghvar ANALYTICS_RELAY_URL)"
SCW_REDACT_URL_STAGING="$(ghvar SCW_REDACT_URL_STAGING)"

# ── Version: slot in between the channel's last build and the next CI run ────
# The `A` counter is the CI run-number, GLOBAL to the repository: it is inherited from
# the channel even when the X.Y.Z base has just been bumped (0.3.2-staging.106.1 →
# 0.3.3-staging.106.2, still below the 0.3.3-staging.107 the next CI run will produce). A
# channel base NEWER than package.json = a forgotten bump, refusal.
PKG="$(node -p "require('$DESKTOP/package.json').version")"
LIVE="$(curl -fsS "$UPDATES_URL/desktop/$CHANNEL/latest-mac.yml" | awk '/^version:/{print $2}')"
SUFFIX="${LIVE#*-staging.}"
if [ -z "$LIVE" ] || [ "$SUFFIX" = "$LIVE" ]; then
  echo "✗ flux du canal illisible ($LIVE) — impossible de choisir une version sûre"; exit 1
fi
LIVE_BASE="${LIVE%%-staging.*}"
HIGHEST="$(printf '%s\n%s\n' "$PKG" "$LIVE_BASE" | sort -V | tail -1)"
if [ "$HIGHEST" != "$PKG" ]; then
  echo "✗ le canal sert $LIVE, package.json dit $PKG — bump oublié ?"; exit 1
fi
A="${SUFFIX%%.*}"; B="${SUFFIX#"$A"}"; B="${B#.}"
VERSION="$PKG-staging.$A.$(( ${B:-0} + 1 ))"
echo "→ canal: $LIVE · local: $VERSION (CI suivante: $PKG-staging.$((A + 1)))"

# ── Build (the SAME keys as release.yml, value for value) ────────────────────
( cd "$ROOT" && \
  VITE_BACKEND_URL="https://staging.$BRAND_DOMAIN" \
  VITE_ADMIN_URL="https://staging.$BRAND_DOMAIN/admin" \
  VITE_UPDATES_CHANNEL="$CHANNEL" \
  VITE_ANALYTICS_RELAY_URL="$ANALYTICS_RELAY_URL" \
  VITE_ANALYTICS_APP_KEY="$ANALYTICS_APP_KEY" \
  VITE_REDACT_FN_URL="$SCW_REDACT_URL_STAGING" \
  VITE_BACKEND_BYPASS="$VERCEL_AUTOMATION_BYPASS_SECRET" \
  pnpm exec turbo run build --filter=@openmasq/desktop... )

# ── Bake (a sha256-verified no-op when the cache is good) ────────────────────
( cd "$DESKTOP" && npm run bake )

# ── Package + sign + notarize (release.yml's ulimit chain, without sudo) ─────
ulimit -n 262144 2>/dev/null || ulimit -n 65536 2>/dev/null || ulimit -n 10240 2>/dev/null || true
echo "→ ulimit -n effectif : $(ulimit -n)"
( cd "$DESKTOP" && pnpm run eb --publish never -c.extraMetadata.version="$VERSION" )

# ── The packaged-tree gate (the one that blocked the CI release) ─────────────
( cd "$ROOT" && pnpm check:pkgtree --require-tree )

# ── Publication: artifacts first, Worker registration last ───────────────────
export UPDATES_URL UPDATES_ADMIN_TOKEN
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
bash "$ROOT/apps/updates/scripts/publish-desktop.sh" --release-dir "$DESKTOP/release" --channel "$CHANNEL"

echo "✓ $VERSION publiée sur $CHANNEL — vérification :"
curl -fsS "$UPDATES_URL/desktop/$CHANNEL/latest-mac.yml" | head -2
