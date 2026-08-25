#!/usr/bin/env bash
#
# LA preuve du bac à sable Windows — le seul contrôle qui dise quelque chose du
# CONFINEMENT plutôt que de la compilation.
#
# Le lanceur de jail peut compiler, se lancer, et ne rien confiner du tout. On lance donc
# le VRAI lanceur autour du VRAI interpréteur baké, et on lui fait tenter deux lectures :
#
#   • son scratch accordé, qui doit RÉUSSIR ;
#   • un fichier témoin posé hors des concessions, qui doit ÉCHOUER.
#
# ⚠️ Les deux comptent, et le premier plus que l'autre. Sans le contrôle POSITIF, un
# lanceur qui plante au démarrage — ou un AppContainer qui ne voit même pas python.exe —
# ferait « échouer » la lecture du témoin et se lirait comme un succès. C'est le mode de
# panne le plus probable d'un premier jet, et celui qu'un test naïf récompense.
#
# UN seul foyer (règle 9) : appelé par `release-windows.yml` (l'essai à blanc) ET par le
# leg Windows de `release.yml` (le garde de release). Recopié, il aurait dérivé — et une
# régression du confinement partirait alors signée chez les utilisateurs.
#
# À lancer depuis `apps/desktop`, après `pnpm bake`. Windows uniquement (cygpath).
set -euo pipefail

# Le nom du binaire expédié dérive de la marque (règle 9 : packages/branding).
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
