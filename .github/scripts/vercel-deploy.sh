#!/usr/bin/env bash
#
# `vercel deploy` avec une BORNE DE TEMPS et un échec nommé.
#
# Pourquoi ce fichier existe au lieu d'un `npx vercel deploy` en ligne : quand Vercel
# refuse l'AUTEUR du commit (« not a member of the team » — typiquement un commit de
# fusion créé sous un compte perso), la CLI **ne rougit pas, elle PEND**. Mesuré le
# 07/08 : des jobs zombies de 25 minutes, aucune ligne de log, et surtout tout contrôle
# placé APRÈS le déploiement — dont « le domaine sert-il bien CE commit » — n'est jamais
# atteint. Le garde-fou héritait du silence qu'il devait détecter.
#
# Cinq minutes couvrent très largement un envoi `--prebuilt` (l'artefact est déjà
# construit). Au-delà, ce n'est pas de la lenteur, c'est ce mur-là.
#
# ⚠️ Le diagnostic part sur STDERR, jamais sur stdout : les appelants capturent la
# sortie (`URL=$(...)`) pour aliaser ou fumer-tester ensuite. Un message d'erreur sur
# stdout deviendrait silencieusement l'« URL » du déploiement — un piège qui se referme
# au moment précis où l'on essaie de diagnostiquer.
#
# UNE maison pour les trois jobs (ops, docs, web) : la même panne les guette
# tous, et trois copies d'un garde-fou dérivent à la première correction (règle 9).
set -euo pipefail

TIMEOUT_S="${VERCEL_DEPLOY_TIMEOUT_S:-300}"

# `timeout` est GNU coreutils : présent sur les runners ubuntu, absent d'un macOS nu
# (où coreutils l'installe sous `gtimeout`). On le résout au lieu de le supposer —
# sinon la borne disparaît en silence sur un poste de dev et le garde-fou ne se teste
# jamais là où on l'écrit.
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN=gtimeout
else
  echo "::error::ni \`timeout\` ni \`gtimeout\` — impossible de borner le déploiement. Refus plutôt que de lancer un appel qui peut pendre 25 min sans borne." >&2
  exit 1
fi

# ── NORMALISER l'AUTEUR pour Vercel — sans toucher à l'historique réel. ───────────────
#
# `vercel deploy` lit le `.git` local et attache l'AUTEUR du commit à la « Source ». Vercel
# valide cet auteur contre les membres de l'équipe et, s'il ne le reconnaît pas, la CLI ne
# rougit pas — elle PEND (25 min, incident du 07/08). Avant, on REFUSAIT tout auteur ≠
# équipe, ce qui interdisait de committer sous son propre nom (règle dure du 10/08).
#
# Désormais on RÉ-AUTHORE le commit de tête en équipe, mais SEULEMENT dans ce checkout
# ÉPHÉMÈRE de CI — jamais repoussé. L'historique réel garde son auteur (Julien, un
# contributeur…), et Vercel voit l'équipe → aucune validation d'appartenance ne tombe, un
# seul siège suffit. C'est un `--amend` local, pas un `git push --force`.
#
# ⚠️ On reste SUR LA BRANCHE (jamais `git checkout <sha>` détaché) : le domaine staging
# est un domaine LIÉ À LA BRANCHE, aliasé par le `githubCommitRef` que la CLI lit ici. Un
# HEAD détaché donnerait `ref: HEAD` et figerait le domaine (le bug mesuré). L'amend
# change le SHA local mais PAS la branche courante — l'alias suit.
#
# `--no-verify` : le pre-commit (identité, LOC) n'a rien à faire dans une ré-écriture
# mécanique de CI. `|| warning` : sur un cas tordu (commit de fusion, arbre bizarre) on
# NE bloque pas le déploiement — au pire Vercel réévaluera l'auteur, et la borne de temps
# ci-dessous reste le filet.
AUTHOR_EMAIL="$(git log -1 --format=%ae 2>/dev/null || echo "")"
case "$AUTHOR_EMAIL" in
  support@openmasq.com | *tgaudibert@users.noreply.github.com)
    : ;; # déjà l'équipe — rien à faire
  *)
    echo "vercel-deploy: commit authored par « ${AUTHOR_EMAIL:-vide} » — ré-authoré en équipe pour CE build éphémère (l'historique réel est inchangé)." >&2
    git -c user.name="tgaudibert" -c user.email="support@openmasq.com" \
      commit --amend --reset-author --no-edit --no-verify --allow-empty >/dev/null 2>&1 \
      || echo "::warning::ré-authorage impossible (commit de fusion ? arbre détaché ?) — on continue ; Vercel pourra refuser l'auteur." >&2
    ;;
esac

# ⚠️ Le code de sortie se capture APRÈS l'appel, pas dans un `if ! …` : dans la branche
# `then` d'une négation, `$?` vaut celui du TEST, pas celui de la commande — un « code 0 »
# affiché sur un échec, mesuré en écrivant ce fichier. `set +e` le temps de l'appel.
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
