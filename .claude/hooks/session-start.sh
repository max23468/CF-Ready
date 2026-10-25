#!/bin/bash
# Sessioni Claude Code nel cloud: stessa preparazione dello setup script dell'ambiente, che
# qui trova quasi tutto in cache e rende disponibile il PATH tramite CLAUDE_ENV_FILE.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

"$CLAUDE_PROJECT_DIR/.claude/cloud-setup.sh"
