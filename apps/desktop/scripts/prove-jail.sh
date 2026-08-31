#!/usr/bin/env bash
#
# THE proof of the Windows sandbox — the only check that says anything about
# CONFINEMENT rather than about compilation.
#
# The jail launcher can compile, start, and confine nothing at all. So we run the REAL
# launcher around the REAL baked interpreter, and make it attempt two reads:
#
#   • its granted scratch, which must SUCCEED;
#   • a canary file placed outside the grants, which must FAIL.
#
# ⚠️ Both matter, and the first more than the other. Without the POSITIVE check, a
# launcher that crashes at startup — or an AppContainer that cannot even see python.exe —
# would make the canary read "fail" and read as a success. That is the most likely
# failure mode of a first attempt, and the one a naive test rewards.
#
# ONE home (rule 9): called by `release-windows.yml` (the dry run) AND by the
# Windows leg of `release.yml` (the release guard). Copied, it would have drifted — and a
# confinement regression would then ship signed to users.
#
# Run from `apps/desktop`, after `pnpm bake`. Windows only (cygpath).
set -euo pipefail

# The shipped binary's name derives from the brand (rule 9: packages/branding).
SLUG="$(node -p "require('../../packages/branding/branding.json').slug")"
JAIL="build/win-jail/$SLUG-jail.exe"
RT_DIR="build/python-runtime/win32-x64"

[ -x "$JAIL" ] || { echo "::error::$SLUG-jail.exe absent — bake:jail n'a rien produit"; exit 1; }
[ -x "$RT_DIR/python/python.exe" ] || { echo "::error::runtime Python win32-x64 absent"; exit 1; }

cleanup() { rm -rf jail-scratch canary.txt; }
trap cleanup EXIT

mkdir -p jail-scratch
echo "visible-to-the-run" > jail-scratch/ok.txt
echo "THE-USER-SECRET" > canary.txt
cat > jail-scratch/probe.py <<'PY'
import sys
try:
    sys.stdout.write("READ-OK:" + open(sys.argv[1], "r").read().strip() + "\n")
except Exception as e:
    sys.stdout.write("READ-DENIED:" + type(e).__name__ + "\n")
PY

RT=$(cygpath -w "$RT_DIR")
SCRATCH=$(cygpath -w "$PWD/jail-scratch")
PY_EXE=$(cygpath -w "$RT_DIR/python/python.exe")
run() { "$JAIL" --allow-read "$RT" --allow-write "$SCRATCH" -- "$PY_EXE" "$SCRATCH\\probe.py" "$1"; }

echo "→ contrôle POSITIF : le scratch accordé doit être lisible"
got=$(run "$SCRATCH\\ok.txt")
echo "  $got"
case "$got" in
  READ-OK:*) echo "  ✓ le run voit son propre scratch" ;;
  *) echo "::error::le run ne peut pas lire son scratch — le jail est cassé, pas strict"; exit 1 ;;
esac

echo "→ contrôle NÉGATIF : un fichier hors des concessions doit être refusé"
got=$(run "$(cygpath -w "$PWD/canary.txt")")
echo "  $got"
case "$got" in
  READ-DENIED:*) echo "  ✓ le témoin est hors d'atteinte" ;;
  *) echo "::error::le témoin a été LU — l'AppContainer ne confine rien"; exit 1 ;;
esac
