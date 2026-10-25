#!/bin/bash
# Sessioni Claude Code nel cloud: toolchain di mise.toml e dipendenze del lockfile, così
# gate locale, `Pubblica` e `Promuovi` girano come sul Mac.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
mise trust --quiet
mise install --yes
mise env --shell bash >>"$CLAUDE_ENV_FILE"
eval "$(mise env --shell bash)"
# `npm ci` non riscrive il lockfile: il worktree resta pulito per la pubblicazione.
npm ci --no-audit --no-fund
