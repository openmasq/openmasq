#!/bin/bash
# Prépare une machine macOS NUE à héberger le parcours-agent, et rien d'autre.
#
# Idempotent : on peut le relancer. Il ne suppose ni Homebrew, ni Xcode, ni Node — c'est le
# point : la machine cible est un Mac de bureau ordinaire, laissé allumé et connecté.
#
# ⚠️ Il exige une session graphique OUVERTE (l'agent pilote une vraie fenêtre Electron) et
# le mot de passe de l'utilisateur pour les Command Line Tools. Il n'écrit AUCUN secret :
# le jeton GitHub et les identifiants Claude Code s'installent depuis la machine de dev,
# par un tube ssh, jamais par ce script (voir le README à côté).
set -euo pipefail

DEPOT="${OPENMASQ_REPO:-$HOME/openmasq/redact}"
NODE_V="${OPENMASQ_NODE_VERSION:-v22.23.2}"   # macOS 12 : Node 24+ ne s'y installe pas
etape() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

etape "Command Line Tools (git, clang, python3 — tout en dépend)"
if ! /usr/bin/xcrun --version >/dev/null 2>&1; then
  # La ruse Apple : ce fichier fait apparaître les CLT dans `softwareupdate -l`.
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
# `.zshrc`/`.bashrc` AUTANT que les profils de connexion : `ssh <machine> 'pnpm …'` ouvre un
# shell NON-login, qui ne lit QUE le rc — sans lui la machine répond « pnpm: command not
# found » alors que pnpm est installé, et rien dans le message ne désigne le PATH.
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
# ⚠️ Ne JAMAIS toucher au `.npmrc` du dépôt : il est SUIVI et porte `node-linker=hoisted`,
# dont tout dépend. Aucun paquet ne déclare `@types/node` — ils le résolvent par le
# hissage — donc sans lui le build des `dist/` casse sur « Cannot find name 'process' »,
# à un endroit qui ne ressemble pas du tout à sa cause.
pnpm install --frozen-lockfile
# Le script d'install d'Electron ne rejoue pas quand le paquet est déjà dans le magasin :
# on le force, sinon `dist/Electron.app` manque et le pilote échoue au lancement — sans que
# `pnpm install` ait signalé quoi que ce soit.
[ -d node_modules/electron/dist ] || node node_modules/electron/install.js

etape "Build de l'app (les paquets d'abord — le build d'app consomme leur dist/)"
pnpm exec node scripts/turbo.mjs run build --filter=@openmasq/desktop
test -f apps/desktop/out/main/index.js

etape "Claude Code + GitHub CLI"
command -v claude >/dev/null || npm i -g @anthropic-ai/claude-code
claude --version
# `gh` depuis les releases OFFICIELLES du projet (jamais un miroir) : sans lui l'agent
# corrige et commite, puis n'a aucun moyen de rendre la PR — le travail reste sur une
# branche que personne ne regarde.
if ! command -v gh >/dev/null; then
  ARCHGH=$([ "$(uname -m)" = "arm64" ] && echo arm64 || echo amd64)
  V=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep -m1 '"tag_name"' | sed 's/.*: *"v\([^"]*\)".*/\1/')
  cd /tmp && curl -fsSL "https://github.com/cli/cli/releases/download/v${V}/gh_${V}_macOS_${ARCHGH}.zip" -o gh.zip
  unzip -oq gh.zip && mkdir -p "$HOME/.local/bin" && cp "gh_${V}_macOS_${ARCHGH}/bin/gh" "$HOME/.local/bin/gh"
  chmod +x "$HOME/.local/bin/gh" && rm -rf gh.zip "gh_${V}_macOS_${ARCHGH}" && cd "$DEPOT"
fi
gh --version | head -1

etape "tmux (console attachable de la session)"
# `run.sh` fait tourner la session DANS tmux pour qu'on puisse s'y brancher pendant qu'elle
# travaille. macOS ne le fournit pas et cette machine n'a ni Homebrew ni sudo : on le
# construit depuis les tarballs OFFICIELS des deux projets, sha256 épinglés (règle 7).
# ⚠️ Deux pièges qui ont coûté du temps : un `configure` avorté salit l'arbre de libevent
# (« EVENT__VERSION undeclared ») — d'où la ré-extraction systématique ; et tmux ≥ 3.4
# REFUSE de configurer sans `--enable-utf8proc` ou `--disable-utf8proc` explicite.
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
