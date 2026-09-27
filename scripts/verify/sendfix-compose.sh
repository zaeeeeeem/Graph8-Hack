#!/usr/bin/env bash
# usage: scripts/verify/sendfix-compose.sh <to-email> "<subject>" "<html body>"
# Fallback first-touch: POST /inbox/emails/compose (sends NOW). Refuses non-allowlisted recipients.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env.local; set +a
TO="$1"; SUBJ="$2"; BODY="$3"
FROM="${G8_FROM_MAILBOX:-$(scripts/verify/sendfix-g8.sh GET /mailboxes | head -1 | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"][0]["email"])')}"
allowed=$(echo "$TEST_ALLOWLIST" | tr ';' '\n' | cut -d'|' -f2 | tr 'A-Z' 'a-z' | grep -Fx "$(echo "$TO" | tr 'A-Z' 'a-z')" || true)
[ -n "$allowed" ] || { echo "REFUSED: recipient not in TEST_ALLOWLIST" >&2; exit 2; }
body=$(python3 -c 'import json,sys; print(json.dumps({"to":[sys.argv[1]],"from_mailbox":sys.argv[2],"subject":sys.argv[3],"content":sys.argv[4],"save_as_draft":False}))' "$TO" "$FROM" "$SUBJ" "$BODY")
t0=$(python3 -c 'import time;print(time.time())')
scripts/verify/sendfix-g8.sh POST /inbox/emails/compose "$body" | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<email>/g'
python3 -c "import time;print('latency_s=%.2f'%(time.time()-$t0))"
