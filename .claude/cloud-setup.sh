#!/bin/bash
# Prepara una sessione Claude Code nel cloud: Node, npm e actionlint di mise.toml, dipendenze
# del lockfile e Chromium di Playwright, così `verify:change` e `Pubblica` girano come sul Mac
# (D-198). Lo richiamano lo setup script dell'ambiente, messo in cache, e l'hook SessionStart;
# ogni passo salta quando il risultato c'è già.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

# mise.toml resta l'unica fonte delle versioni; nel cloud si scaricano i binari ufficiali con
# checksum, senza installare mise.
tool() { sed -n "s/^$1 = \"\\(.*\\)\"$/\\1/p" mise.toml; }
node_version="$(tool node)"
npm_version="$(tool npm)"
actionlint_version="$(tool actionlint)"
case "$(uname -m)" in
  x86_64) node_arch=x64 actionlint_arch=amd64 ;;
  aarch64 | arm64) node_arch=arm64 actionlint_arch=arm64 ;;
  *) echo "Architettura non supportata: $(uname -m)" >&2 && exit 1 ;;
esac
tools="${CF_READY_TOOLS:-$HOME/.cache/cf-ready-tools}"
node_home="$tools/node-v$node_version-linux-$node_arch"
mkdir -p "$tools/bin"

# Scarica un archivio e lo verifica con la riga del suo file di checksum ufficiale.
verified() {
  local url="$1" sums="$2" file="$3"
  curl -fsSL -o "$tools/$file" "$url"
  curl -fsSL "$sums" | grep -E "  \\*?$file\$" | (cd "$tools" && sha256sum --check --status)
}

# I binari Node per Linux richiedono libatomic, assente nelle immagini Ubuntu minime.
if ! ldconfig -p | grep -q 'libatomic\.so\.1'; then
  apt-get update -qq && apt-get install -y -qq libatomic1
fi
if [ ! -x "$node_home/bin/node" ]; then
  archive="node-v$node_version-linux-$node_arch.tar.xz"
  verified "https://nodejs.org/dist/v$node_version/$archive" \
    "https://nodejs.org/dist/v$node_version/SHASUMS256.txt" "$archive"
  tar -xJf "$tools/$archive" -C "$tools"
  rm "$tools/$archive"
fi
export PATH="$node_home/bin:$tools/bin:$PATH"
if [ "$(npm --version)" != "$npm_version" ]; then
  npm install --global --no-audit --no-fund "npm@$npm_version"
fi
if [ "$("$tools/bin/actionlint" -version 2>/dev/null | head -n 1)" != "$actionlint_version" ]; then
  archive="actionlint_${actionlint_version}_linux_$actionlint_arch.tar.gz"
  release="https://github.com/rhysd/actionlint/releases/download/v$actionlint_version"
  verified "$release/$archive" "$release/actionlint_${actionlint_version}_checksums.txt" "$archive"
  tar -xzf "$tools/$archive" -C "$tools/bin" actionlint
  rm "$tools/$archive"
fi

# Le shell dei comandi successivi partono dal profilo: il PATH vale anche dove l'hook non
# scrive CLAUDE_ENV_FILE.
path_line="export PATH=\"$node_home/bin:$tools/bin:\$PATH\""
touch "$HOME/.bashrc"
grep -Fqx "$path_line" "$HOME/.bashrc" || printf '%s\n' "$path_line" >>"$HOME/.bashrc"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  printf '%s\n' "$path_line" >>"$CLAUDE_ENV_FILE"
fi

# `npm ci` non riscrive il lockfile: il worktree resta pulito per la pubblicazione.
lock="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [ "$(cat node_modules/.cf-ready-lock 2>/dev/null)" != "$lock" ]; then
  npm ci --no-audit --no-fund
  printf '%s\n' "$lock" >node_modules/.cf-ready-lock
fi

# Le dipendenze di sistema servono una volta; il browser della versione fissata si aggiorna.
if compgen -G "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}/chromium-*" >/dev/null; then
  npx playwright install chromium
else
  npx playwright install --with-deps chromium
fi
