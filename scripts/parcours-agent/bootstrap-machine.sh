#!/bin/bash
# Prepares a BARE macOS machine to host the parcours-agent, and nothing else.
#
# Idempotent: it can be re-run. It assumes neither Homebrew, nor Xcode, nor Node — that is
# the point: the target machine is an ordinary desktop Mac, left on and connected.
#
# ⚠️ It requires an OPEN graphical session (the agent drives a real Electron window) and the
# user's password for the Command Line Tools. It writes NO secret: the GitHub token and the
# Claude Code credentials are installed from the dev machine, through an ssh pipe, never by
# this script (see the README next to it).
set -euo pipefail

DEPOT="${OPENMASQ_REPO:-$HOME/openmasq/redact}"
NODE_V="${OPENMASQ_NODE_VERSION:-v22.23.2}"   # macOS 12: Node 24+ will not install on it
etape() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

etape "Command Line Tools (git, clang, python3 — tout en dépend)"
if ! /usr/bin/xcrun --version >/dev/null 2>&1; then
  # The Apple trick: this file makes the CLT appear in `softwareupdate -l`.
  sudo touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
  LABEL=$(softwareupdate -l 2>/dev/null | grep -o 'Command Line Tools for Xcode-[0-9.]*' | tail -1)
  [ -n "$LABEL" ] || { echo "aucun paquet CLT proposé — installer Xcode à la main"; exit 1; }
  sudo softwareupdate -i "$LABEL" --verbose
  sudo rm -f /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
fi
git --version

etape "Node $NODE_V + pnpm (sans sudo, sans Homebrew)"
ARCH=$([ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64)
if [ "$($HOME/.local/node/bin/node -v 2>/dev/null)" != "$NODE_V" ]; then
  mkdir -p "$HOME/.local"
  curl -fsSL "https://nodejs.org/dist/$NODE_V/node-$NODE_V-darwin-$ARCH.tar.gz" -o /tmp/node.tgz
  rm -rf "$HOME/.local/node" && tar -xzf /tmp/node.tgz -C "$HOME/.local"
  mv "$HOME/.local/node-$NODE_V-darwin-$ARCH" "$HOME/.local/node" && rm -f /tmp/node.tgz
fi
# `.zshrc`/`.bashrc` AS MUCH as the login profiles: `ssh <machine> 'pnpm …'` opens a
# NON-login shell, which reads ONLY the rc — without it the machine answers « pnpm: command
# not found » while pnpm is installed, and nothing in the message points at the PATH.
for RC in "$HOME/.zprofile" "$HOME/.profile" "$HOME/.zshrc" "$HOME/.bashrc"; do
  grep -q '.local/node/bin' "$RC" 2>/dev/null ||
    printf '%s\n' 'case ":$PATH:" in *":$HOME/.local/node/bin:"*) ;; *)' \
      '  export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH" ;; esac' >> "$RC"
done
export PATH="$HOME/.local/node/bin:$PATH"
corepack enable --install-directory "$HOME/.local/node/bin"
corepack prepare pnpm@10.17.0 --activate

etape "Dépôt"
mkdir -p "$(dirname "$DEPOT")"
[ -d "$DEPOT/.git" ] || git clone --no-tags https://github.com/tgaudibert/openmasq.git "$DEPOT"
cd "$DEPOT" && git fetch origin && git checkout staging && git pull --ff-only

etape "Dépendances"
# ⚠️ NEVER touch the repo's `.npmrc`: it is TRACKED and carries `node-linker=hoisted`, on
# which everything depends. No package declares `@types/node` — they resolve it through the
# hoisting — so without it the `dist/` build breaks on « Cannot find name 'process' », in a
# place that looks nothing like its cause.
pnpm install --frozen-lockfile
# Electron's install script does not replay when the package is already in the store: we
# force it, otherwise `dist/Electron.app` is missing and the driver fails at launch — with
# `pnpm install` having signalled nothing at all.
[ -d node_modules/electron/dist ] || node node_modules/electron/install.js

etape "Build de l'app (les paquets d'abord — le build d'app consomme leur dist/)"
pnpm exec node scripts/turbo.mjs run build --filter=@openmasq/desktop
test -f apps/desktop/out/main/index.js

etape "Claude Code + GitHub CLI"
command -v claude >/dev/null || npm i -g @anthropic-ai/claude-code
claude --version
# `gh` from the project's OFFICIAL releases (never a mirror): without it the agent fixes and
# commits, then has no way to hand back the PR — the work stays on a branch nobody looks at.
if ! command -v gh >/dev/null; then
  ARCHGH=$([ "$(uname -m)" = "arm64" ] && echo arm64 || echo amd64)
  V=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep -m1 '"tag_name"' | sed 's/.*: *"v\([^"]*\)".*/\1/')
  cd /tmp && curl -fsSL "https://github.com/cli/cli/releases/download/v${V}/gh_${V}_macOS_${ARCHGH}.zip" -o gh.zip
  unzip -oq gh.zip && mkdir -p "$HOME/.local/bin" && cp "gh_${V}_macOS_${ARCHGH}/bin/gh" "$HOME/.local/bin/gh"
  chmod +x "$HOME/.local/bin/gh" && rm -rf gh.zip "gh_${V}_macOS_${ARCHGH}" && cd "$DEPOT"
fi
gh --version | head -1

etape "tmux (console attachable de la session)"
# `run.sh` runs the session IN tmux so that one can plug into it while it works. macOS does
# not ship it and this machine has neither Homebrew nor sudo: we build it from the two
# projects' OFFICIAL tarballs, sha256 pinned (rule 7).
# ⚠️ Two traps that cost time: an aborted `configure` dirties the libevent tree
# (« EVENT__VERSION undeclared ») — hence the systematic re-extraction; and tmux ≥ 3.4
# REFUSES to configure without an explicit `--enable-utf8proc` or `--disable-utf8proc`.
if ! command -v tmux >/dev/null; then
  LIBEVENT_SHA=92e6de1be9ec176428fd2367677e61ceffc2ee1cb119035037a27d346b0403bb
  TMUX_SHA=16216bd0877170dfcc64157085ba9013610b12b082548c7c9542cc0103198951
  T=$(mktemp -d) && cd "$T"
  curl -fsSL -o libevent.tgz https://github.com/libevent/libevent/releases/download/release-2.1.12-stable/libevent-2.1.12-stable.tar.gz
  curl -fsSL -o tmux.tgz     https://github.com/tmux/tmux/releases/download/3.5a/tmux-3.5a.tar.gz
  echo "$LIBEVENT_SHA  libevent.tgz" | shasum -a 256 -c - || { echo "libevent: empreinte inattendue"; exit 1; }
  echo "$TMUX_SHA  tmux.tgz"         | shasum -a 256 -c - || { echo "tmux: empreinte inattendue"; exit 1; }
  tar xzf libevent.tgz && tar xzf tmux.tgz
  (cd libevent-2.1.12-stable && ./configure --prefix="$HOME/.local" --disable-openssl --disable-samples >/dev/null && make -j4 >/dev/null 2>&1 && make install >/dev/null)
  (cd tmux-3.5a && ./configure --prefix="$HOME/.local" --disable-utf8proc \
      CFLAGS="-I$HOME/.local/include" LDFLAGS="-L$HOME/.local/lib" >/dev/null &&
    make -j4 >/dev/null 2>&1 && make install >/dev/null)
  cd "$DEPOT" && rm -rf "$T"
fi
tmux -V

etape "État de l'agent"
mkdir -p "$HOME/.openmasq-agent"
chmod +x "$DEPOT/scripts/parcours-agent/run.sh"

cat <<EOF

Reste à faire depuis la machine de DEV (aucun secret n'est écrit par ce script) :
  1. jeton GitHub      : gh auth token | ssh <machine> 'gh auth login --with-token'
                         et pour git : gh auth token | ssh <machine> 'umask 077; read -r T; \\
                           printf "https://x-access-token:%s@github.com\\n" "\$T" > ~/.git-credentials'
                         puis, sur la machine : git config --global credential.helper store
  2. Claude Code       : 'claude setup-token' SUR CETTE MACHINE (jeton longue durée).
                         ⚠️ Recopier le trousseau d'une autre machine MARCHE puis MEURT :
                         les deux se disputent le rafraîchissement OAuth, et la boucle
                         s'éteint sans prévenir. Repli : ANTHROPIC_API_KEY.
  3. sessions autos    : cp scripts/parcours-agent/com.openmasq.parcours-agent.plist ~/Library/LaunchAgents/
                         launchctl bootstrap gui/\$(id -u) ~/Library/LaunchAgents/com.openmasq.parcours-agent.plist
  4. une session à la main, pour voir : scripts/parcours-agent/run.sh
Coupe-circuit : touch ~/.openmasq-agent/PAUSE
EOF
