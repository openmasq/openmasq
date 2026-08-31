#!/usr/bin/env bash
#
# publish-desktop.sh — publish an electron-updater desktop release to the
# unified updates Worker.
#
# Two steps, mirroring how the Worker serves desktop:
#   1. Upload the built artifacts (latest*.yml + .dmg/.zip/.blockmap) to the
#      R2 bucket under `desktop/<channel>/<filename>` (S3-compatible API —
#      binaries are too large to stream through a Worker).
#   2. POST each latest*.yml to the Worker's /admin/desktop/releases so the
#      feed can serve it and rollout rules can target it.
#
# Usage:
#   apps/updates/scripts/publish-desktop.sh --release-dir apps/desktop/release --channel latest
#
# Flags:
#   --release-dir <dir>   electron-builder output dir (default apps/desktop/release)
#   --channel <name>      desktop channel (default: latest)
#   --notes <text>        release notes
#   --dry-run             print what would happen, upload nothing
#   -h | --help
#
# Environment (required unless --dry-run):
#   UPDATES_URL            Worker base URL (e.g. https://<worker>.<acct>.workers.dev)
#   UPDATES_ADMIN_TOKEN    Bearer for /admin/*
#   R2_ACCOUNT_ID          Cloudflare account id (for the S3 endpoint)
#   R2_BUCKET              R2 bucket name (default: <brand slug>-updates)
#   R2_ACCESS_KEY_ID       R2 S3 access key
#   R2_SECRET_ACCESS_KEY   R2 S3 secret

set -euo pipefail

RELEASE_DIR="apps/desktop/release"
CHANNEL="latest"
NOTES=""
DRY_RUN=false
# Default bucket name derives from the brand slug (packages/branding/branding.json,
# the brand's one home) — matches the TF-provisioned `<slug>-updates` bucket.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
R2_BUCKET="${R2_BUCKET:-$(node -p "require(process.argv[1]).slug" "$SCRIPT_DIR/../../../packages/branding/branding.json")-updates}"

die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m→\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }

while [ $# -gt 0 ]; do
    case "$1" in
        --release-dir) RELEASE_DIR=${2:?}; shift 2 ;;
        --channel)     CHANNEL=${2:?}; shift 2 ;;
        --notes)       NOTES=${2:?}; shift 2 ;;
        --dry-run)     DRY_RUN=true; shift ;;
        -h|--help)     grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *)             die "unknown flag: $1" ;;
    esac
done

[ -d "$RELEASE_DIR" ] || die "release dir not found: $RELEASE_DIR"

# The manifest files electron-builder emits (mac/win/linux). Only the ones
# that exist are published.
MANIFESTS=()
for m in latest-mac.yml latest.yml latest-linux.yml; do
    [ -f "$RELEASE_DIR/$m" ] && MANIFESTS+=("$m")
done
[ ${#MANIFESTS[@]} -gt 0 ] || die "no latest*.yml in $RELEASE_DIR — build the desktop app first"

# Artifacts to ship to R2 (top-level files only; skip the unpacked .app dir).
# macOS release runners ship bash 3.2 + BSD find — no `mapfile`, no `find
# -printf`. Collect portably: default -print, then basename off the "./" prefix.
ARTIFACTS=()
while IFS= read -r _f; do
    ARTIFACTS+=("$(basename "$_f")")
done < <(cd "$RELEASE_DIR" && find . -maxdepth 1 -type f \
    \( -name '*.yml' -o -name '*.zip' -o -name '*.dmg' -o -name '*.blockmap' -o -name '*.exe' -o -name '*.AppImage' \))

echo
echo "  Channel     : $CHANNEL"
echo "  Release dir : $RELEASE_DIR"
echo "  Bucket      : $R2_BUCKET (desktop/$CHANNEL/)"
echo "  Manifests   : ${MANIFESTS[*]}"
echo "  Artifacts   : ${#ARTIFACTS[@]} files"
echo

if $DRY_RUN; then
    info "Dry run — nothing uploaded."
    exit 0
fi

for v in UPDATES_URL UPDATES_ADMIN_TOKEN R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
    [ -n "${!v:-}" ] || die "$v is required (or pass --dry-run)"
done

ENDPOINT="https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com"

# ── 1. Upload artifacts to R2 (desktop/<channel>/<filename>) ─────────
info "Uploading ${#ARTIFACTS[@]} artifacts to s3://$R2_BUCKET/desktop/$CHANNEL/"
for f in "${ARTIFACTS[@]}"; do
    AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto \
        aws s3 cp "$RELEASE_DIR/$f" "s3://$R2_BUCKET/desktop/$CHANNEL/$f" --endpoint-url "$ENDPOINT" >/dev/null
    ok "  $f"
done

# ── 2. Register each manifest with the Worker ───────────────────────
for m in "${MANIFESTS[@]}"; do
    # La plateforme est une DIMENSION de la clé côté Worker (une ligne par
    # plateforme) : sans elle, enregistrer `latest.yml` après `latest-mac.yml`
    # écrasait le manifeste mac. Le Worker la relit dans le contenu du manifeste
    # et ne fait confiance à ce paramètre qu'à défaut — on l'envoie quand même,
    # parce que le nom du fichier est ici une information certaine.
    case "$m" in
        latest-mac.yml)   PLATFORM=mac ;;
        latest-linux.yml) PLATFORM=linux ;;
        latest.yml)       PLATFORM=win ;;
        *)                die "manifeste inattendu : $m" ;;
    esac
    URL="$UPDATES_URL/admin/desktop/releases?channel=$CHANNEL&platform=$PLATFORM"
    [ -n "$NOTES" ] && URL+="&notes=$(printf '%s' "$NOTES" | sed 's/ /%20/g')"
    info "Registering $m → $URL"
    STATUS=$(curl -sS -o /tmp/desktop-register.$$ -w '%{http_code}' \
        -X POST "$URL" \
        -H "Authorization: Bearer $UPDATES_ADMIN_TOKEN" \
        -H "Content-Type: text/yaml" \
        --data-binary "@$RELEASE_DIR/$m" || true)
    if [ "$STATUS" != "200" ]; then
        cat "/tmp/desktop-register.$$" >&2 || true; rm -f "/tmp/desktop-register.$$"
        die "register failed for $m (HTTP $STATUS)"
    fi
    ok "  registered ($(cat /tmp/desktop-register.$$))"; rm -f "/tmp/desktop-register.$$"
done

ok "Desktop release published to channel '$CHANNEL'"
