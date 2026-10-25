#!/bin/sh
# Blocca invocazioni e installazioni di Prettier: il formattatore è oxfmt (npm run format).
command=$(jq -r '.tool_input.command // ""')
if printf '%s' "$command" | grep -Eiq '(^|[;&|(`[:space:]/])prettier([[:space:]@;&|)`]|$)' \
  && ! printf '%s' "$command" | grep -Eiq '^[[:space:]]*(git[[:space:]]+(grep|log|show|diff)|grep|rg|ugrep)[[:space:]]'; then
  echo "Prettier è vietato: usa npm run format o npx --ignore-scripts oxfmt." >&2
  exit 2
fi
exit 0
