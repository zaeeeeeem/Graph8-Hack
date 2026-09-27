#!/usr/bin/env bash
# usage: scripts/verify/sendfix-g8.sh METHOD PATH [JSON_BODY]
# Thin graph8 REST helper for SENDFIX verification. Never echoes the API key.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env.local; set +a
BASE="${G8_BASE_URL:-https://be.graph8.com/api/v1}"
M="$1"; P="$2"; B="${3:-}"
if [ -n "$B" ]; then
  curl -sS -X "$M" "$BASE$P" -H "Authorization: Bearer $G8_API_KEY" -H "Content-Type: application/json" -d "$B" -w '\nHTTP %{http_code}\n'
else
  curl -sS -X "$M" "$BASE$P" -H "Authorization: Bearer $G8_API_KEY" -w '\nHTTP %{http_code}\n'
fi
