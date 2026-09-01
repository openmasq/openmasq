#!/bin/bash
# One autonomous parcours-agent session: guard rails, then hand over to the skill.
#
# This script decides NOTHING about what the agent does — that is the `parcours-agent`
# skill's job. It only does what a skill cannot do for itself: refuse to start when it
# must not, and never let two sessions step on each other.
set -uo pipefail

ETAT="${OPENMASQ_AGENT_HOME:-$HOME/.openmasq-agent}"
DEPOT="${OPENMASQ_REPO:-$HOME/openmasq/redact}"
mkdir -p "$ETAT"
JOURNAL="$ETAT/runs.log"
dire() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$JOURNAL"; }

# ── Circuit breaker ──────────────────────────────────────────────────────────────
# A file, not a setting: armed from any terminal, with nothing to re-read.
if [ -f "$ETAT/PAUSE" ]; then
  dire "PAUSE présent — session sautée."
  exit 0
fi

# ── One agent at a time ──────────────────────────────────────────────────────────
# Two sessions in the same tree would corrupt each other (one branch, one build, one
# Electron profile, one single-instance lock). `mkdir` is the atomic acquisition.
VERROU="$ETAT/lock"
if ! mkdir "$VERROU" 2>/dev/null; then
  # A lock older than 3 h comes from a killed session, not from a live one.
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
  # The driver keeps an Electron app open: leaving it behind eats the machine.
  (cd "$DEPOT/apps/desktop" && pnpm --filter @openmasq/desktop drive down) >/dev/null 2>&1
  pkill -f "parcours/driver/daemon.ts" 2>/dev/null
  # The tmux pane would survive a killed launcher: the next wake-up would see a session
  # « déjà là » and attach to a ghost. We close it with the rest.
  command -v tmux >/dev/null 2>&1 &&
    tmux kill-session -t "${OPENMASQ_TMUX_SESSION:-parcours}" 2>/dev/null
  return 0
}
trap nettoyer EXIT

export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"
cd "$DEPOT" || { dire "dépôt introuvable : $DEPOT"; exit 1; }

# The screen must be unlocked: Electron needs a graphical session, and a locked session
# renders black windows — hence screenshots that look like bugs.
if ! /usr/bin/pgrep -q WindowServer; then
  dire "pas de session graphique — session sautée."
  exit 0
fi

# ── Back to a clean base ─────────────────────────────────────────────────────────
# ⚠️ It is HERE, mechanically, and not in a skill instruction: the agent modifies the
# repo — including ITS OWN driver and its own instructions. Without a reset, a session
# that leaves the tree dirty bequeaths its uncommitted changes to the next one, which
# believes it is testing the base and is in fact testing its predecessor's draft. The
# only thing that may cross the border between two sessions is what a HUMAN has merged
# into the base.
#
# That work is never DESTROYED for all that: it is parked on a dated branch. A session
# killed mid-diagnosis often has half the answer in its tree.
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

# ── The two accesses without which the session can deliver NOTHING ───────────────
# Claude Code first. A session of more than an hour that dies on the first second with
# « Not logged in » burns a slot and leaves only an exit code; the OAuth token EXPIRES
# (it has already gone out once, and nobody knew before coming to read the logs). We say
# it here, in one line read in `runs.log`.
if ! echo "ping" | claude -p --max-turns 1 >/dev/null 2>&1; then
  dire "AUTH CLAUDE HS — \`claude setup-token\` sur cette machine, ou CLAUDE_CODE_OAUTH_TOKEN. Session sautée."
  exit 0
fi
# GitHub next: without it the agent works, fixes, commits… and cannot hand back the PR.
# The work is not lost (it stays on its branch) but nobody sees it.
command -v gh >/dev/null && gh auth status >/dev/null 2>&1 ||
  dire "gh indisponible ou non authentifié — la session tournera, mais la PR devra être ouverte à la main."

dire "démarrage (branche $(git rev-parse --abbrev-ref HEAD), $(git rev-parse --short HEAD))"

# `--dangerously-skip-permissions` is accepted HERE and only here: dedicated machine,
# throwaway clone, no real account mounted (connectors = fixtures), and the skill forbids
# itself any push to `dev`/`main`. Without this flag a session with no terminal refuses
# every tool and does nothing at all — which gives the illusion of a running agent.
# ⚠️ `--model opus` is EXPLICIT, not an inherited default: a session plays a profession, reads
# logs, arbitrates between « fuite » and « invariant » and writes production code. A lighter
# model holds the driving but not the judgement, and bad autonomous judgement costs more than
# the whole session — it produces false defects a human then has to refute.
JOURNAL_SESSION="$ETAT/session-$(date +%F).log"
LIMITE="${OPENMASQ_AGENT_TIMEOUT:-5400}"
EXPIRE=""

# The session runs IN TMUX so that one can plug into it while it works:
#   ssh <machine> -t 'tmux attach -t parcours'
# Without that, a 90-minute session is only observable after the fact, in a log — and it is
# precisely while it runs that one wants to see what it does. `capture-pane` also allows
# READING the console without attaching, hence without risking typing into it.
# The log keeps being written: `tee` in the pane, no `pipe-pane` (which also copies the
# escape sequences and makes the file unreadable).
TMUX_SESSION="${OPENMASQ_TMUX_SESSION:-parcours}"
if command -v tmux >/dev/null 2>&1; then
  CODEF="$ETAT/.code.$$"
  rm -f "$CODEF"
  tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
  # Explicit `bash -c`: otherwise tmux launches `/bin/sh`, which has no `PIPESTATUS` — and
  # without it we would collect `tee`'s exit code instead of the session's. NO_COLOR keeps
  # the log readable while leaving the pane coloured.
  tmux new-session -d -s "$TMUX_SESSION" -x 220 -y 60 bash -c \
    "NO_COLOR=1 claude -p '/parcours-agent' --model opus --dangerously-skip-permissions 2>&1 \
       | tee -a '$JOURNAL_SESSION'; printf '%s' \"\${PIPESTATUS[0]}\" > '$CODEF'"
  dire "console : ssh <machine> -t 'tmux attach -t $TMUX_SESSION'"

  DEBUT=$SECONDS
  while tmux has-session -t "$TMUX_SESSION" 2>/dev/null; do
    if [ $((SECONDS - DEBUT)) -ge "$LIMITE" ]; then
      EXPIRE=1
      # The last screen BEFORE killing: it is the only trace of what the session was doing
      # when the deadline cut it (cf. the finding « une session interrompue perd tout son
      # travail »). The pane is 60 lines, most of them empty — we cut the trail, otherwise
      # the log ends on fifty blank lines.
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
  # Fallback without tmux (machine not bootstrapped): same behaviour, console not attachable.
  # ⚠️ No `timeout` on macOS (it is a GNU tool): using it here killed the launcher with 127
  # without any session starting — an agent « qui tourne » that does nothing. Hence this
  # background timer, and a flag laid on DISK: the subshell cannot write a variable of the
  # parent.
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
