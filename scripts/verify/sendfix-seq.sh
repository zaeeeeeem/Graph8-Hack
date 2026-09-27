#!/usr/bin/env bash
# usage: scripts/verify/sendfix-seq.sh <list_id> <contact_id> "<name>"
# Minimal 1-step EMAIL sequence: create -> PATCH schedule -> add contacts -> run -> poll until sent.
# Caller must ensure the list holds ONLY allowlisted contacts (run enrolls the whole list).
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env.local; set +a
G=scripts/verify/sendfix-g8.sh
LIST="$1"; CID="$2"; NAME="$3"
FROM="${G8_FROM_MAILBOX:-$($G GET /mailboxes | head -1 | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"][0]["email"])')}"
MASK='s/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]+/<email>/g'
# Guard: /run enrolls the WHOLE list, so every contact on it must be allowlisted.
$G GET "/lists/$LIST/contacts?limit=100" | head -1 | python3 -c '
import json,os,sys
allow={p.split("|")[1].strip().lower() for p in os.environ["TEST_ALLOWLIST"].split(";") if p.count("|")>=1}
rows=json.load(sys.stdin)["data"]
bad=[r["id"] for r in rows if (r.get("work_email") or "").lower() not in allow]
if not rows or bad: sys.exit("REFUSED: list empty or has non-allowlisted contacts %s" % bad)' || exit 2
now() { python3 -c 'import time;print(time.time())'; }
body=$(python3 -c 'import json,sys; print(json.dumps({
 "name":sys.argv[1],"user_email":sys.argv[3],"finish_on_reply":True,
 "associated_list_id":int(sys.argv[2]),
 "steps":[{"step_order":1,"step_type":"EMAIL","input_type":"MANUAL_TEMPLATE","time_interval":0,
   "step_data":{"subject":"Graphi SENDFIX {{first_name}}","body":"Hi {{first_name}}, graphi SENDFIX sequence test."}}],
 "channels":[{"channel_id":1,"channel_type":"GMAIL","channel_value":sys.argv[3]}]}))' "$NAME" "$LIST" "$FROM")
SID=$($G POST /sequences "$body" | head -1 | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["id"])')
echo "sequence=$SID"
$G PATCH "/sequences/$SID" "{\"schedule_id\":\"$G8_DEMO_SCHEDULE_ID\"}" | head -1
$G POST "/sequences/$SID/contacts" "{\"contact_ids\":[$CID],\"list_id\":$LIST}" | head -1
t0=$(now)
$G POST "/sequences/$SID/run" '{}' | head -1
for i in $(seq 1 40); do
  sleep 10
  st=$($G GET "/sequences/$SID/contacts" | head -1 | python3 -c 'import json,sys;d=json.load(sys.stdin)["data"];print(",".join("%s:%s:%s"%(c["contact_id"],c["state"],c["current_step_order"]) for c in d))')
  el=$(python3 -c "import time;print('%.0f'%(time.time()-$t0))")
  echo "+${el}s $st"
  case "$st" in *completed*|*in_progress*|*failed*|*bounced*) break;; esac
done
$G GET "/sequences/$SID/stats" | head -1 | sed -E "$MASK"
