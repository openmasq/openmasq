#!/usr/bin/env bash
#
# claude-sandbox.sh — Claude Code with --dangerously-skip-permissions, LOCKED IN.
#
# Runs `claude --dangerously-skip-permissions` under sandbox-exec (macOS seatbelt). The
# process AND everything it runs inherits the sandbox: writing is DENIED BY DEFAULT and
# re-opened on an explicit list (this repository, the temporaries, the toolchain's caches);
# reading /Users likewise.
#
# What stays OUT of this guardrail's reach:
#   • The NETWORK. Seatbelt does not filter by host: this bounds the FILESYSTEM, not
#     exfiltration.
#   • The keychain (~/Library/Keychains) stays readable AND writable, or the session cannot
#     authenticate. With ANTHROPIC_API_KEY, remove the two lines marked KEYCHAIN.
#   • sandbox-exec is deprecated by Apple (still functional; Chrome and Electron use it).
#
# NO CODE LEAVES: every remote git transport, the credential helpers, ssh/scp/sftp and `gh`
# are DENIED AT EXECUTION; LOCAL git stays whole. The key agent is unhooked from the
# environment, because a key handed over by the agent pushes without touching the disk.
#   ⚠️ This denial is on PATHS: copying one of those binaries elsewhere works around it.
#   Airtightness needs the network layer (loopback only + a CONNECT proxy outside).
#
# Usage:  ./scripts/tooling/claude-sandbox.sh [args passed to claude…]
#         ./scripts/tooling/claude-sandbox.sh --print-profile   # inspect the profile
#
# Widening it occasionally, without touching the script:
#   CLAUDE_SANDBOX_READ="$HOME/.config/gh"  ./scripts/tooling/claude-sandbox.sh
#   CLAUDE_SANDBOX_WRITE="/allowed/path"    ./scripts/tooling/claude-sandbox.sh
# (lists separated by ':', like a PATH)

set -euo pipefail

[[ "$(uname -s)" == "Darwin" ]] || { echo "claude-sandbox: macOS only (seatbelt)." >&2; exit 1; }
command -v sandbox-exec >/dev/null || { echo "claude-sandbox: sandbox-exec not found." >&2; exit 1; }

CLAUDE_BIN="$(command -v claude || true)"
[[ -n "$CLAUDE_BIN" ]] || { echo "claude-sandbox: 'claude' not found in PATH." >&2; exit 1; }

# REAL paths (seatbelt reasons on /private/…, not on the /var, /tmp links).
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
HOME_DIR="$(cd "$HOME" && pwd -P)"
TMP_ROOT="$(dirname "$(cd "${TMPDIR:-/tmp}" && pwd -P)")"   # /private/var/folders/xx/yyy
HOME_RE="$(printf '%s' "$HOME_DIR" | sed 's/[][^$.*+?(){}|\\\/]/\\&/g')"

# Optional extras → one (subpath "…") line per path.
extras() {
  local list="${1:-}" p out=""
  IFS=':' read -r -a _paths <<< "$list"
  for p in "${_paths[@]:-}"; do
    [[ -n "$p" ]] || continue
    out+="  (subpath \"$(cd "$p" 2>/dev/null && pwd -P || printf '%s' "$p")\")"$'\n'
  done
  printf '%s' "$out"
}

# Transports able to PUSH code — denied at execution, by real path.
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

;; A permissive base, then reads and writes are TIGHTENED.
;; In SBPL the LAST matching rule wins: the order below is the rule.
(allow default)

;; ─────────── READ: /Users denied, then an allow-list ───────────
(deny file-read* (subpath "/Users"))

(allow file-read*
  (subpath "$PROJECT")
  (literal "$HOME_DIR")                       ; list the home, without reading it
  (regex #"^$HOME_RE/\\.[^/]+\$")             ; first-level dotfiles (.zshrc, .gitconfig…)
  (subpath "$HOME_DIR/.claude")
  (subpath "$HOME_DIR/.openmasq-agent")      ; log, PAUSE, allowed accounts
  (subpath "$HOME_DIR/.local")                ; the claude binary lives here
  (subpath "$HOME_DIR/.cache")
  (subpath "$HOME_DIR/.npm")
  (subpath "$HOME_DIR/.config/git")
  (subpath "$HOME_DIR/Library/pnpm")
  (subpath "$HOME_DIR/Library/Caches")
  (subpath "$HOME_DIR/Library/Preferences")
  (subpath "$HOME_DIR/Library/Keychains")     ; KEYCHAIN (OAuth auth)
$(extras "${CLAUDE_SANDBOX_READ:-}")
)

;; Secrets: re-denied AFTER the list, so the dotfiles regex does not reopen them.
(deny file-read*
  (subpath "$HOME_DIR/.ssh")
  (subpath "$HOME_DIR/.aws")
  (subpath "$HOME_DIR/.gnupg")
  (subpath "$HOME_DIR/.kube")
  (subpath "$HOME_DIR/.docker")
  (literal "$HOME_DIR/.netrc")
)

;; ─────────── WRITE: everything denied, then an allow-list ───────────
(deny file-write*)

(allow file-write*
  (subpath "$PROJECT")
  (subpath "$TMP_ROOT")
  (subpath "/private/tmp")
  (subpath "/private/var/tmp")
  (subpath "$HOME_DIR/.claude")               ; history, shell snapshots, todos
  (subpath "$HOME_DIR/.openmasq-agent")      ; the agent skills' state directory
  (regex #"^$HOME_RE/\\.claude\\.json")       ; + .claude.json.backup / .tmp
  (subpath "$HOME_DIR/.cache")
  (subpath "$HOME_DIR/.npm")
  (subpath "$HOME_DIR/.local/state")
  (subpath "$HOME_DIR/.local/share")
  (subpath "$HOME_DIR/Library/pnpm")          ; the pnpm store
  (subpath "$HOME_DIR/Library/Caches")        ; electron, esbuild, turbo…
  (subpath "$HOME_DIR/Library/Keychains")     ; KEYCHAIN (token refresh)
$(extras "${CLAUDE_SANDBOX_WRITE:-}")
)

;; ─────────── PUSHING CODE: every way out closed ───────────
;; LOCAL git stays whole; only the REMOTE transports disappear.
(deny process-exec*
$(push_denies)
)

;; Terminal / pipes: without this, no pty, no interactive UI.
(allow file-write*
  (literal "/dev/null") (literal "/dev/zero")
  (literal "/dev/random") (literal "/dev/urandom")
  (literal "/dev/tty") (literal "/dev/ptmx")
  (regex #"^/dev/(fd/|ttys)")
)
PROFILE_EOF

# ─────────── ANCESTORS: making what is allowed REACHABLE ───────────
# realpath(3) — which Node applies to EVERY entry point — lstats EACH component of a path,
# so an allowed file becomes unreachable if an ancestor falls under the /Users `deny`
# (`EPERM … lstat '/Users'`). We reopen the METADATA (lstat) of the ancestor folders only —
# never their content or their listing. Derived from the profile ITSELF, so any path added
# above makes its ancestors traversable. Last, because in SBPL the LAST matching rule wins.
{
  printf '\n;; Ancestors of the allowed paths — METADATA only (lstat), derived above.\n'
  grep -oE '\((subpath|literal) "/Users/[^"]*"\)' "$PROFILE" \
    | sed -E 's/.*"(.*)".*/\1/' \
    | awk '{ p = $0; while (sub("/[^/]*$", "", p) && p != "") print p }' \
    | sort -u \
    | sed 's|^|  (allow file-read-metadata (literal "|; s|$|"))|'
} >> "$PROFILE"

# Harness layer: the OS denial is the real barrier; this one stops the gesture
# early and SAYS why, instead of leaving an "operation not permitted" to read.
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
            "statusMessage": "Anti-push check"
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
  --help|-h) sed -n '3,39p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

cd "$PROJECT"
echo "claude-sandbox: writes limited to $PROJECT (+ tmp/caches) · push/PR impossible · network NOT filtered" >&2
# The key agent and the tokens are UNHOOKED: denying ~/.ssh is not enough if a
# key arrives through the agent's socket, nor if a PAT is lying around in env.
exec sandbox-exec -f "$PROFILE" \
  env -u SSH_AUTH_SOCK -u GH_TOKEN -u GITHUB_TOKEN -u GH_ENTERPRISE_TOKEN \
      -u GIT_ASKPASS -u SSH_ASKPASS -u GIT_SSH -u GIT_SSH_COMMAND \
      GIT_TERMINAL_PROMPT=0 CLAUDE_SANDBOX=1 \
  "$CLAUDE_BIN" --dangerously-skip-permissions --settings "$SETTINGS" "$@"
