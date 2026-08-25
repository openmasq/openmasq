#!/usr/bin/env bash
#
# claude-sandbox.sh — Claude Code en --dangerously-skip-permissions, ENFERMÉ.
#
# Lance `claude --dangerously-skip-permissions` sous sandbox-exec (seatbelt
# macOS). Le processus, ET tout ce qu'il exécute (node, git, pnpm, un script
# qu'il vient d'écrire…), hérite de la sandbox : l'écriture est REFUSÉE PAR
# DÉFAUT et n'est ré-ouverte que sur une liste explicite — ce dépôt, les
# temporaires, et les caches/état dont la chaîne d'outils a besoin. La lecture
# de /Users est refusée par défaut, et ré-ouverte sur la même logique.
#
# Ce qui reste HORS de portée de ce garde-fou (dites-le, ne le maquillez pas) :
#   • Le RÉSEAU. Seatbelt ne filtre pas utilement par hôte : le processus garde
#     un accès sortant complet. Cette sandbox borne le SYSTÈME DE FICHIERS, pas
#     l'exfiltration. Ne l'utilisez pas comme si elle bornait les deux.
#   • Le trousseau (~/Library/Keychains) est lisible ET inscriptible, sinon la
#     session ne peut pas s'authentifier ni rafraîchir son jeton. Si vous
#     passez par ANTHROPIC_API_KEY, retirez les deux lignes marquées TROUSSEAU.
#   • sandbox-exec est déprécié par Apple (toujours fonctionnel, et c'est le
#     mécanisme que les bacs à sable de Chrome/Electron utilisent encore).
#
# AUCUN CODE NE SORT : tout transport git distant (git-remote-http(s)/ext,
# send-pack), les aides d'identifiants, ssh/scp/sftp et `gh` sont REFUSÉS À
# L'EXÉCUTION. Le git LOCAL reste entier (status, diff, commit, branche) — c'est
# le push, la PR et le fetch distant qui disparaissent. L'agent de clés est
# décroché de l'environnement, sinon ~/.ssh refusé ne suffit pas : une clé
# transmise par l'agent pousse sans jamais toucher au disque.
#   ⚠️ Ce refus porte sur des CHEMINS. Recopier un de ces binaires ailleurs puis
#   l'exécuter le contourne — c'est un contournement délibéré, pas un accident,
#   mais ce n'est pas de l'étanchéité. L'étanchéité demande la couche réseau :
#   loopback seul + un proxy CONNECT hors sandbox dont la liste exclut GitHub.
#
# Usage :  ./scripts/claude-sandbox.sh [args passés à claude…]
#          ./scripts/claude-sandbox.sh --print-profile   # inspecter le profil
#
# Élargir ponctuellement, sans toucher au script :
#   CLAUDE_SANDBOX_READ="$HOME/.config/gh"  ./scripts/claude-sandbox.sh
#   CLAUDE_SANDBOX_WRITE="/chemin/autorisé" ./scripts/claude-sandbox.sh
# (listes séparées par ':', comme un PATH)

set -euo pipefail

[[ "$(uname -s)" == "Darwin" ]] || { echo "claude-sandbox: macOS uniquement (seatbelt)." >&2; exit 1; }
command -v sandbox-exec >/dev/null || { echo "claude-sandbox: sandbox-exec introuvable." >&2; exit 1; }

CLAUDE_BIN="$(command -v claude || true)"
[[ -n "$CLAUDE_BIN" ]] || { echo "claude-sandbox: 'claude' introuvable dans le PATH." >&2; exit 1; }

# Chemins RÉELS (seatbelt raisonne sur /private/…, pas sur les liens /var, /tmp).
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
HOME_DIR="$(cd "$HOME" && pwd -P)"
TMP_ROOT="$(dirname "$(cd "${TMPDIR:-/tmp}" && pwd -P)")"   # /private/var/folders/xx/yyy
HOME_RE="$(printf '%s' "$HOME_DIR" | sed 's/[][^$.*+?(){}|\\\/]/\\&/g')"

# Extras optionnels → une ligne (subpath "…") par chemin.
extras() {
  local list="${1:-}" p out=""
  IFS=':' read -r -a _paths <<< "$list"
  for p in "${_paths[@]:-}"; do
    [[ -n "$p" ]] || continue
    out+="  (subpath \"$(cd "$p" 2>/dev/null && pwd -P || printf '%s' "$p")\")"$'\n'
  done
  printf '%s' "$out"
}

# Transports capables de POUSSER du code — refusés à l'exécution, par chemin réel.
GIT_CORE="$(git --exec-path 2>/dev/null || echo /usr/libexec/git-core)"
push_denies() {
  local b
  for b in git-remote-http git-remote-https git-remote-ftp git-remote-ftps \
           git-remote-ext git-send-pack git-http-push \
           git-credential git-credential-osxkeychain git-credential-store \
           git-credential-cache git-credential-cache--daemon; do
    printf '  (literal "%s")\n' "$GIT_CORE/$b"
  done
  for b in gh ssh scp sftp ssh-agent ssh-add; do
    command -v "$b" >/dev/null && printf '  (literal "%s")\n' "$(command -v "$b")"
  done
  printf '  (regex #"^/(usr|opt/homebrew)/bin/(ssh|scp|sftp)")\n'
}

PROFILE="${TMPDIR:-/tmp}/claude-sandbox.sb"
cat > "$PROFILE" <<PROFILE_EOF
(version 1)

;; Base permissive, puis on RESSERRE lecture et écriture.
;; En SBPL la DERNIÈRE règle qui matche gagne : l'ordre ci-dessous est la règle.
(allow default)

;; ─────────── LECTURE : /Users refusé, puis liste d'autorisation ───────────
(deny file-read* (subpath "/Users"))

(allow file-read*
  (subpath "$PROJECT")
  (literal "$HOME_DIR")                       ; lister le home, sans le lire
  (regex #"^$HOME_RE/\\.[^/]+\$")             ; dotfiles de 1er niveau (.zshrc, .gitconfig…)
  (subpath "$HOME_DIR/.claude")
  (subpath "$HOME_DIR/.openmasq-agent")      ; journal, PAUSE, comptes-autorises
  (subpath "$HOME_DIR/.local")                ; le binaire claude vit ici
  (subpath "$HOME_DIR/.cache")
  (subpath "$HOME_DIR/.npm")
  (subpath "$HOME_DIR/.config/git")
  (subpath "$HOME_DIR/Library/pnpm")
  (subpath "$HOME_DIR/Library/Caches")
  (subpath "$HOME_DIR/Library/Preferences")
  (subpath "$HOME_DIR/Library/Keychains")     ; TROUSSEAU (auth OAuth)
$(extras "${CLAUDE_SANDBOX_READ:-}")
)

;; Secrets : re-refusés APRÈS la liste, pour que le regex dotfiles ne les rouvre pas.
(deny file-read*
  (subpath "$HOME_DIR/.ssh")
  (subpath "$HOME_DIR/.aws")
  (subpath "$HOME_DIR/.gnupg")
  (subpath "$HOME_DIR/.kube")
  (subpath "$HOME_DIR/.docker")
  (literal "$HOME_DIR/.netrc")
)

;; ─────────── ÉCRITURE : tout refusé, puis liste d'autorisation ───────────
(deny file-write*)

(allow file-write*
  (subpath "$PROJECT")
  (subpath "$TMP_ROOT")
  (subpath "/private/tmp")
  (subpath "/private/var/tmp")
  (subpath "$HOME_DIR/.claude")               ; historique, snapshots shell, todos
  (subpath "$HOME_DIR/.openmasq-agent")      ; §7 de parcours-agent : rendre compte
  (regex #"^$HOME_RE/\\.claude\\.json")       ; + .claude.json.backup / .tmp
  (subpath "$HOME_DIR/.cache")
  (subpath "$HOME_DIR/.npm")
  (subpath "$HOME_DIR/.local/state")
  (subpath "$HOME_DIR/.local/share")
  (subpath "$HOME_DIR/Library/pnpm")          ; store pnpm
  (subpath "$HOME_DIR/Library/Caches")        ; électron, esbuild, turbo…
  (subpath "$HOME_DIR/Library/Keychains")     ; TROUSSEAU (rafraîchissement du jeton)
$(extras "${CLAUDE_SANDBOX_WRITE:-}")
)

;; ─────────── POUSSER DU CODE : toutes les sorties fermées ───────────
;; Le git LOCAL reste entier ; seuls les transports DISTANTS disparaissent.
(deny process-exec*
$(push_denies)
)

;; Terminal / pipes : sans ça, pas de pty, pas d'UI interactive.
(allow file-write*
  (literal "/dev/null") (literal "/dev/zero")
  (literal "/dev/random") (literal "/dev/urandom")
  (literal "/dev/tty") (literal "/dev/ptmx")
  (regex #"^/dev/(fd/|ttys)")
)
PROFILE_EOF

# ─────────── ANCÊTRES : rendre ATTEIGNABLE ce qui est autorisé ───────────
# realpath(3) — que Node applique à TOUT point d'entrée, et le shell à chaque
# `stat` — lstat CHAQUE composant du chemin. Un fichier pourtant autorisé est
# donc inatteignable si un de ses ancêtres tombe sous le `deny` de /Users :
# l'échec sort en `EPERM … lstat '/Users'`, qui se lit comme une panne de l'outil
# et pas comme une règle de bac à sable. On rouvre les MÉTADONNÉES (lstat) des
# seuls dossiers ancêtres — jamais leur contenu : un voisin reste illisible, et
# son nom même n'apparaît pas (aucune lecture de dossier n'est accordée ici).
# Dérivé du profil LUI-MÊME, donc sans dérive possible : tout chemin ajouté à une
# liste d'autorisation ci-dessus rend automatiquement ses ancêtres traversables.
# En dernier, parce qu'en SBPL la DERNIÈRE règle qui matche gagne.
{
  printf '\n;; Ancêtres des chemins autorisés — MÉTADONNÉES seulement (lstat), dérivées ci-dessus.\n'
  grep -oE '\((subpath|literal) "/Users/[^"]*"\)' "$PROFILE" \
    | sed -E 's/.*"(.*)".*/\1/' \
    | awk '{ p = $0; while (sub("/[^/]*$", "", p) && p != "") print p }' \
    | sort -u \
    | sed 's|^|  (allow file-read-metadata (literal "|; s|$|"))|'
} >> "$PROFILE"

# Couche harnais : le refus OS est la vraie barrière, celle-ci arrête le geste
# tôt et DIT pourquoi, au lieu de laisser lire un « operation not permitted ».
SETTINGS="${TMPDIR:-/tmp}/claude-sandbox.settings.json"
cat > "$SETTINGS" <<'SETTINGS_EOF'
{
  "permissions": {
    "deny": [
      "Bash(git push:*)",
      "Bash(git send-pack:*)",
      "Bash(git remote set-url:*)",
      "Bash(gh:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.command // \"\"' | grep -qiE 'git[[:space:]]+(push|send-pack)|git[[:space:]]+remote[[:space:]]+(set-url|add)|(^|[^[:alnum:]_/-])gh[[:space:]]+(pr|repo|api|release|auth|workflow)|(^|[^[:alnum:]_/-])(scp|sftp)[[:space:]]' && echo '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"claude-sandbox : POUSSER DU CODE EST INTERDIT ici. Les transports distants (git-remote-http(s), send-pack, ssh/scp, gh) sont refuses a l execution par le bac a sable : la commande echouerait de toute facon. Commite en local, et laisse un humain pousser hors du bac a sable.\"}}' || true",
            "statusMessage": "Vérification anti-push"
          }
        ]
      }
    ]
  }
}
SETTINGS_EOF

case "${1:-}" in
  --print-profile)  cat "$PROFILE";  exit 0 ;;
  --print-settings) cat "$SETTINGS"; exit 0 ;;
  --help|-h) sed -n '3,42p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

cd "$PROJECT"
echo "claude-sandbox: écriture limitée à $PROJECT (+ tmp/caches) · push/PR impossibles · réseau NON filtré" >&2
# L'agent de clés et les jetons sont DÉCROCHÉS : ~/.ssh refusé ne suffit pas si
# une clé arrive par le socket de l'agent, ni si un PAT traîne dans l'env.
exec sandbox-exec -f "$PROFILE" \
  env -u SSH_AUTH_SOCK -u GH_TOKEN -u GITHUB_TOKEN -u GH_ENTERPRISE_TOKEN \
      -u GIT_ASKPASS -u SSH_ASKPASS -u GIT_SSH -u GIT_SSH_COMMAND \
      GIT_TERMINAL_PROMPT=0 CLAUDE_SANDBOX=1 \
  "$CLAUDE_BIN" --dangerously-skip-permissions --settings "$SETTINGS" "$@"
