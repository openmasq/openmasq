#!/bin/bash
# Une session autonome du parcours-agent : garde-fous, puis on passe la main au skill.
#
# Ce script ne décide RIEN de ce que l'agent fait — c'est le rôle du skill
# `parcours-agent`. Il ne fait que ce qu'un skill ne peut pas faire
# pour lui-même : refuser de démarrer quand il ne faut pas, et ne jamais laisser deux
# sessions se marcher dessus.
set -uo pipefail

ETAT="${OPENMASQ_AGENT_HOME:-$HOME/.openmasq-agent}"
DEPOT="${OPENMASQ_REPO:-$HOME/openmasq/redact}"
mkdir -p "$ETAT"
JOURNAL="$ETAT/runs.log"
dire() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$JOURNAL"; }

# ── Coupe-circuit ────────────────────────────────────────────────────────────────
# Un fichier, pas un réglage : on l'arme depuis n'importe quel terminal, sans rien relire.
if [ -f "$ETAT/PAUSE" ]; then
  dire "PAUSE présent — session sautée."
  exit 0
fi

# ── Un seul agent à la fois ──────────────────────────────────────────────────────
# Deux sessions dans le même arbre se corrompraient mutuellement (une branche, un build,
# un profil Electron, un verrou d'instance unique). `mkdir` est l'acquisition atomique.
VERROU="$ETAT/lock"
if ! mkdir "$VERROU" 2>/dev/null; then
  # Un verrou plus vieux que 3 h vient d'une session tuée, pas d'une session vivante.
  if [ -n "$(find "$VERROU" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then
    dire "verrou périmé (>3 h) — repris."
    rm -rf "$VERROU" && mkdir "$VERROU" || exit 0
  else
    dire "une session tourne déjà — sautée."
    exit 0
  fi
fi
nettoyer() {
  rmdir "$VERROU" 2>/dev/null
  # Le pilote garde une app Electron ouverte : la laisser derrière soi mange la machine.
  (cd "$DEPOT/apps/desktop" && pnpm --filter @openmasq/desktop drive down) >/dev/null 2>&1
  pkill -f "parcours/driver/daemon.ts" 2>/dev/null
  # Le volet tmux survivrait à un lanceur tué : le prochain réveil verrait une session
  # « déjà là » et s'attacherait à un fantôme. On le ferme avec le reste.
  command -v tmux >/dev/null 2>&1 &&
    tmux kill-session -t "${OPENMASQ_TMUX_SESSION:-parcours}" 2>/dev/null
  return 0
}
trap nettoyer EXIT

export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
cd "$DEPOT" || { dire "dépôt introuvable : $DEPOT"; exit 1; }

# L'écran doit être déverrouillé : Electron a besoin d'une session graphique, et une session
# verrouillée rend des fenêtres noires — donc des captures qui ressemblent à des bugs.
if ! /usr/bin/pgrep -q WindowServer; then
  dire "pas de session graphique — session sautée."
  exit 0
fi

# ── Repartir de la base, propre ──────────────────────────────────────────────────
# ⚠️ C'est ICI, mécaniquement, et pas dans une consigne du skill : l'agent modifie le
# dépôt — y compris SON PROPRE pilote et son propre mode d'emploi. Sans remise à zéro,
# une session qui laisse l'arbre sale lègue ses modifications non commitées à la
# suivante, qui croit éprouver la base et éprouve en réalité le brouillon de sa
# devancière. La seule chose qui doit franchir la frontière entre deux sessions est ce
# qu'un HUMAIN a fusionné dans la base.
#
# On ne DÉTRUIT jamais ce travail pour autant : il est parqué sur une branche datée. Une
# session tuée en plein diagnostic a souvent la moitié de la réponse dans son arbre.
BASE="${OPENMASQ_AGENT_BRANCH:-staging}"
git fetch -q origin || dire "fetch impossible — on travaille sur ce qu'on a."
if [ -n "$(git status --porcelain)" ]; then
  PARK="parcours/rescape-$(date +%m%d-%H%M)"
  if git checkout -q -b "$PARK" && git add -A && git commit -q -m "wip: session précédente interrompue"; then
    dire "arbre sale — travail parqué sur $PARK"
  else
    dire "arbre sale ET parcage impossible — session sautée (intervention humaine)."
    exit 0
  fi
fi
git checkout -q "$BASE" && git reset -q --hard "origin/$BASE" || {
  dire "impossible de repartir de $BASE — session sautée."
  exit 0
}

# ── Les deux accès sans lesquels la session ne peut RIEN rendre ──────────────────
# Claude Code d'abord. Une session de plus d'une heure qui meurt à la première seconde
# sur « Not logged in » consomme un créneau et ne laisse qu'un code de sortie ; le jeton
# OAuth EXPIRE (il s'est déjà éteint une fois, et personne ne l'a su avant de venir lire
# les journaux). On le dit ici, en une ligne qu'on lit dans `runs.log`.
if ! echo "ping" | claude -p --max-turns 1 >/dev/null 2>&1; then
  dire "AUTH CLAUDE HS — \`claude setup-token\` sur cette machine, ou CLAUDE_CODE_OAUTH_TOKEN. Session sautée."
  exit 0
fi
# GitHub ensuite : sans lui l'agent travaille, corrige, commite… et ne peut pas rendre
# la PR. Le travail n'est pas perdu (il reste sur sa branche) mais personne ne le voit.
command -v gh >/dev/null && gh auth status >/dev/null 2>&1 ||
  dire "gh indisponible ou non authentifié — la session tournera, mais la PR devra être ouverte à la main."

dire "démarrage (branche $(git rev-parse --abbrev-ref HEAD), $(git rev-parse --short HEAD))"

# `--dangerously-skip-permissions` est assumé ICI et seulement ici : machine dédiée, clone
# jetable, aucun compte réel monté (connecteurs = fixtures), et le skill s'interdit tout push
# sur `dev`/`main`. Sans ce drapeau une session sans terminal refuse chaque outil et ne
# fait rien du tout — ce qui donne l'illusion d'un agent qui tourne.
# ⚠️ `--model opus` est EXPLICITE, pas un défaut hérité : une session joue un métier, lit des
# journaux, arbitre entre « fuite » et « invariant » et écrit du code de production. Un modèle
# plus léger tient le pilotage mais pas le jugement, et un mauvais jugement autonome coûte plus
# cher que la session entière — il produit des faux défauts qu'un humain doit ensuite réfuter.
JOURNAL_SESSION="$ETAT/session-$(date +%F).log"
LIMITE="${OPENMASQ_AGENT_TIMEOUT:-5400}"
EXPIRE=""

# La session tourne DANS TMUX pour qu'on puisse s'y brancher pendant qu'elle travaille :
#   ssh <machine> -t 'tmux attach -t parcours'
# Sans ça, une session de 90 minutes n'est observable qu'après coup, dans un journal — et
# c'est précisément pendant qu'elle tourne qu'on veut voir ce qu'elle fait. `capture-pane`
# permet en plus de LIRE la console sans s'attacher, donc sans risquer de taper dedans.
# Le journal continue d'être écrit : `tee` dans le volet, pas de `pipe-pane` (qui recopie
# aussi les séquences d'échappement et rend le fichier illisible).
TMUX_SESSION="${OPENMASQ_TMUX_SESSION:-parcours}"
if command -v tmux >/dev/null 2>&1; then
  CODEF="$ETAT/.code.$$"
  rm -f "$CODEF"
  tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
  # `bash -c` explicite : tmux lance sinon `/bin/sh`, qui n'a pas `PIPESTATUS` — et sans lui
  # on récupérerait le code de `tee` au lieu de celui de la session. NO_COLOR garde le
  # journal lisible tout en laissant le volet coloré.
  tmux new-session -d -s "$TMUX_SESSION" -x 220 -y 60 bash -c \
    "NO_COLOR=1 claude -p '/parcours-agent' --model opus --dangerously-skip-permissions 2>&1 \
       | tee -a '$JOURNAL_SESSION'; printf '%s' \"\${PIPESTATUS[0]}\" > '$CODEF'"
  dire "console : ssh <machine> -t 'tmux attach -t $TMUX_SESSION'"

  DEBUT=$SECONDS
  while tmux has-session -t "$TMUX_SESSION" 2>/dev/null; do
    if [ $((SECONDS - DEBUT)) -ge "$LIMITE" ]; then
      EXPIRE=1
      # Le dernier écran AVANT de tuer : c'est la seule trace de ce que la session était en
      # train de faire quand la borne l'a coupée (cf. le constat « une session interrompue
      # perd tout son travail »). Le volet fait 60 lignes dont la plupart sont vides — on
      # coupe la traîne, sinon le journal se termine sur cinquante lignes blanches.
      {
        printf '\n--- dernier écran avant la coupure (%ss) ---\n' "$LIMITE"
        tmux capture-pane -p -t "$TMUX_SESSION" 2>/dev/null |
          awk 'NF{d=NR} {l[NR]=$0} END{for(i=1;i<=d;i++) print l[i]}'
      } >>"$JOURNAL_SESSION" 2>/dev/null || true
      tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
      break
    fi
    sleep 5
  done
  CODE=$(cat "$CODEF" 2>/dev/null || echo 1)
  rm -f "$CODEF"
else
  # Repli sans tmux (machine non bootstrappée) : même comportement, console non attachable.
  # ⚠️ Pas de `timeout` sur macOS (c'est un outil GNU) : l'utiliser ici tuait le lanceur en
  # 127 sans qu'aucune session ne démarre — un agent « qui tourne » et ne fait rien. D'où ce
  # minuteur en arrière-plan, et un drapeau posé sur DISQUE : le sous-shell ne peut pas
  # écrire une variable du parent.
  dire "tmux absent — session non attachable (voir bootstrap-machine.sh)"
  claude -p "/parcours-agent" --model opus --dangerously-skip-permissions \
    >>"$JOURNAL_SESSION" 2>&1 &
  CLAUDE_PID=$!
  DRAPEAU="$ETAT/.expire.$$"
  ( sleep "$LIMITE"; kill -0 "$CLAUDE_PID" 2>/dev/null && : > "$DRAPEAU" && kill -TERM "$CLAUDE_PID" ) &
  MINUTEUR=$!
  wait "$CLAUDE_PID"
  CODE=$?
  kill "$MINUTEUR" 2>/dev/null
  [ -f "$DRAPEAU" ] && { EXPIRE=1; rm -f "$DRAPEAU"; }
fi

if [ -n "$EXPIRE" ]; then
  dire "session interrompue (délai de ${LIMITE}s dépassé) — voir session-$(date +%F).log"
elif [ "$CODE" -eq 0 ]; then
  dire "session terminée."
else
  dire "session en échec (code $CODE) — voir session-$(date +%F).log"
fi
exit 0
