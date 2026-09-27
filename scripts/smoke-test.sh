#!/usr/bin/env bash
# Checks what a graph8 API key can see. Read-only: sends nothing, spends no credits.
# Usage: bash scripts/smoke-test.sh
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] && set -a && . ./.env.local && set +a
: "${G8_API_KEY:?Set G8_API_KEY in .env.local}"
BASE="${G8_BASE_URL:-https://be.graph8.com/api/v1}"

call() { # method path [body]
  local code body
  body=$(curl -s -m 30 -w '\n%{http_code}' -X "$1" "$BASE$2" \
    -H "Authorization: Bearer $G8_API_KEY" -H 'Content-Type: application/json' ${3:+-d "$3"})
  code=${body##*$'\n'}; body=${body%$'\n'*}
  printf '%-6s %-40s %s  %s\n' "$1" "$2" "$code" "$(echo "$body" | tr -d '\n' | cut -c1-160)"
}

echo "Base: $BASE   Key prefix: ${G8_API_KEY:0:8}..."
echo "== 1. Org + credits =="
call GET /usage
echo "== 2. Channels available =="
call GET "/mailboxes?limit=5"
call GET /linkedin/connection
call GET /integrations/linkedin-outreach/connection
call GET /voice/agent-phone-numbers
call GET /sequencer/channels/phone_numbers
echo "== 3. Data + context =="
call GET "/contacts?limit=1"
call GET "/global-context/documents?limit=3"
call GET /intelligence/org-domain
call GET "/sequences?limit=3"
call GET /deals/pipelines
call GET /webhooks
