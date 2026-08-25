#!/usr/bin/env bash
# Déploiement desktop STAGING depuis un poste — le MIROIR EXACT de release.yml.
#
# Règle unique : chaque VITE_* baké ici porte la MÊME valeur qu'en CI, résolue à la
# MÊME source. Les variables GitHub (publiques) sont lues EN DIRECT via `gh` — si la
# CI change d'URL, ce script suit sans édition ; une variable absente en CI bake VIDE
# ici aussi (le repli embarqué de l'app est le même des deux côtés). Les secrets
# viennent de leurs foyers locaux : `.env` racine (signature Apple, R2, bypass Vercel)
# et l'environnement (`OPENMASQ_UPDATES_ADMIN_TOKEN`, `OPENMASQ_ANALYTICS_APP_KEY`) —
# les mêmes valeurs que celles poussées dans GitHub Actions.
#
# Version : `X.Y.Z-staging.A.B` — au-dessus du dernier build du canal, EN DESSOUS du
# prochain run CI (A+1) : les builds locaux s'intercalent sans jamais entrer en
# collision avec la numérotation `-staging.<run_number>` de la CI.
#
# Étapes = release.yml : build (VITE_* bakés, porte check-bundle incluse) → bake
# (sha256) → electron-builder sign+notarize → check:pkgtree → publish (artefacts
# d'abord, enregistrement Worker en DERNIER — le canal ne voit jamais un état
# intermédiaire).
set -euo pipefail

DESKTOP="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$DESKTOP/../.." && pwd)"
REPO="tgaudibert/openmasq"
CHANNEL="desktop-staging"
# La marque n'a qu'une maison (règle 9) : le domaine vient de packages/branding.
BRAND_DOMAIN="$(node -p "require('$ROOT/packages/branding/branding.json').domain")"
UPDATES_URL="${UPDATES_URL:-https://updates.$BRAND_DOMAIN}"

# ── L'arbre doit être COMMITTÉ — la CI construit un commit, jamais un chantier ──
# C'est le dernier écart local/CI, et le plus sournois : un déploiement lancé pendant
# qu'une autre session édite embarque du travail à moitié fait (vécu : un type en
# cours de refactor a cassé le build ; s'il avait compilé, il aurait ÉTÉ LIVRÉ).
# OPENMASQ_RELEASE_DIRTY=1 pour outrepasser en connaissance de cause.
if [ -z "${OPENMASQ_RELEASE_DIRTY:-}" ] && [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]; then
  echo "✗ arbre de travail modifié — committe (ou OPENMASQ_RELEASE_DIRTY=1) :"
  git -C "$ROOT" status --porcelain --untracked-files=no | head -10
  exit 1
fi

# ── Secrets locaux ───────────────────────────────────────────────────────────
set -a; source "$ROOT/.env"; set +a
export CSC_LINK="$MAC_CSC_LINK" CSC_KEY_PASSWORD="$MAC_CSC_KEY_PASSWORD"
export R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-$R2_SECRET_KEY_ID}"
# L'infra n'est plus dans ce dépôt : ces deux secrets se fournissent par l'environnement.
UPDATES_ADMIN_TOKEN="${OPENMASQ_UPDATES_ADMIN_TOKEN:-}"
ANALYTICS_APP_KEY="${OPENMASQ_ANALYTICS_APP_KEY:-}"
[ -n "$UPDATES_ADMIN_TOKEN" ] || { echo "✗ OPENMASQ_UPDATES_ADMIN_TOKEN manquant (export-le avant de lancer)"; exit 1; }
[ -n "$ANALYTICS_APP_KEY" ] || { echo "✗ OPENMASQ_ANALYTICS_APP_KEY manquant (export-le avant de lancer)"; exit 1; }
for v in CSC_LINK CSC_KEY_PASSWORD APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID \
         R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY \
         VERCEL_AUTOMATION_BYPASS_SECRET; do
  [ -n "${!v:-}" ] || { echo "✗ $v manquant (.env racine)"; exit 1; }
done

# ── Variables CI, lues en direct (parité stricte, y compris l'ABSENCE) ───────
ghvar() { gh api "repos/$REPO/actions/variables/$1" --jq .value 2>/dev/null || true; }
ANALYTICS_RELAY_URL="$(ghvar ANALYTICS_RELAY_URL)"
SCW_REDACT_URL_STAGING="$(ghvar SCW_REDACT_URL_STAGING)"

# ── Version : s'intercaler entre le dernier build du canal et le prochain run CI ──
# Le compteur `A` est le run-number CI, GLOBAL au dépôt : il s'hérite du canal même
# quand la base X.Y.Z vient d'être bumpée (0.3.2-staging.106.1 → 0.3.3-staging.106.2,
# toujours sous le 0.3.3-staging.107 que produira le prochain run CI). Une base du
# canal PLUS RÉCENTE que package.json = un bump oublié, refus.
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

# ── Build (les MÊMES clés que release.yml, valeur pour valeur) ───────────────
( cd "$ROOT" && \
  VITE_BACKEND_URL="https://staging.$BRAND_DOMAIN" \
  VITE_ADMIN_URL="https://staging.$BRAND_DOMAIN/admin" \
  VITE_UPDATES_CHANNEL="$CHANNEL" \
  VITE_ANALYTICS_RELAY_URL="$ANALYTICS_RELAY_URL" \
  VITE_ANALYTICS_APP_KEY="$ANALYTICS_APP_KEY" \
  VITE_REDACT_FN_URL="$SCW_REDACT_URL_STAGING" \
  VITE_BACKEND_BYPASS="$VERCEL_AUTOMATION_BYPASS_SECRET" \
  pnpm exec turbo run build --filter=@openmasq/desktop... )

# ── Bake (no-op vérifié sha256 quand le cache est bon) ───────────────────────
( cd "$DESKTOP" && npm run bake )

# ── Package + sign + notarize (la chaîne ulimit de release.yml, sans sudo) ───
ulimit -n 262144 2>/dev/null || ulimit -n 65536 2>/dev/null || ulimit -n 10240 2>/dev/null || true
echo "→ ulimit -n effectif : $(ulimit -n)"
( cd "$DESKTOP" && pnpm run eb --publish never -c.extraMetadata.version="$VERSION" )

# ── La porte de l'arbre packagé (celle qui a bloqué la release CI) ───────────
( cd "$ROOT" && pnpm check:pkgtree --require-tree )

# ── Publication : artefacts d'abord, enregistrement Worker en dernier ────────
export UPDATES_URL UPDATES_ADMIN_TOKEN
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
bash "$ROOT/apps/updates/scripts/publish-desktop.sh" --release-dir "$DESKTOP/release" --channel "$CHANNEL"

echo "✓ $VERSION publiée sur $CHANNEL — vérification :"
curl -fsS "$UPDATES_URL/desktop/$CHANNEL/latest-mac.yml" | head -2
