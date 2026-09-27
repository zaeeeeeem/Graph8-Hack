#!/usr/bin/env bash
# Scans tracked files + full git history for secret-shaped patterns and any literal value
# currently in .env.local. Never prints secret values — only file:line + which VAR matched.
# Exit 0 = clean, exit 1 = hits found (or forbidden paths tracked).
set -u
HITS=0

say_hit() { echo "HIT: $1"; HITS=1; }

echo "== secret-scan: pattern scan (tracked files) =="
PATTERNS='xoxb-|xapp-|xoxp-|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|sk_(live|test)_[A-Za-z0-9]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|g8_[A-Za-z0-9]{20,}'
if git grep -InE "$PATTERNS" -- . 2>/dev/null | grep -v '^scripts/secret-scan.sh' > /tmp/secret-scan-tracked.$$; then
  while IFS=: read -r file line rest; do
    say_hit "$file:$line (pattern match)"
  done < /tmp/secret-scan-tracked.$$
fi
rm -f /tmp/secret-scan-tracked.$$

echo "== secret-scan: pattern scan (full git history) =="
if git log -p --all 2>/dev/null | grep -EnA0 "$PATTERNS" > /tmp/secret-scan-hist.$$; then
  COUNT=$(wc -l < /tmp/secret-scan-hist.$$ | tr -d ' ')
  if [ "$COUNT" -gt 0 ]; then
    say_hit "git history contains $COUNT line(s) matching secret patterns (run 'git log -p --all | grep -En \"$PATTERNS\"' locally to inspect — do not print here)"
  fi
fi
rm -f /tmp/secret-scan-hist.$$

echo "== secret-scan: literal values from .env.local (secret-shaped vars only) =="
# Non-secret vars (public URLs, model names, channel/schedule ids) are excluded — flagging
# them produces noise, not signal, since they aren't sensitive if committed.
SECRET_VARS='G8_API_KEY G8_WEBHOOK_SECRET GEMINI_API_KEY SLACK_BOT_TOKEN SLACK_APP_TOKEN SLACK_SIGNING_SECRET SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY TEST_ALLOWLIST'
if [ -f .env.local ]; then
  while IFS='=' read -r key val; do
    case "$key" in
      ''|'#'*) continue ;;
    esac
    case " $SECRET_VARS " in
      *" $key "*) : ;;
      *) continue ;;
    esac
    val="${val%\"}"; val="${val#\"}"
    # skip empty, short, or placeholder-ish values
    if [ -z "$val" ] || [ "${#val}" -lt 8 ]; then continue; fi
    if git grep -IFqn -- "$val" -- . 2>/dev/null; then
      git grep -IFn -- "$val" -- . 2>/dev/null | while IFS=: read -r file line rest; do
        echo "HIT: $file:$line (VAR=$key value present)"
      done
      HITS=1
    fi
    if git log -p --all -S"$val" --oneline 2>/dev/null | grep -q .; then
      say_hit "git history contains value of VAR=$key (found via git log -S)"
    fi
  done < .env.local
else
  echo "no .env.local present locally — skipping literal-value check"
fi

echo "== secret-scan: forbidden paths must not be tracked =="
for p in 'extra/' '.env' '.env.local' '.env.*.local'; do
  TRACKED=$(git ls-files -- "$p" 2>/dev/null)
  if [ -n "$TRACKED" ]; then
    say_hit "tracked file(s) matching forbidden path '$p': $TRACKED"
  fi
done

echo "=================================="
if [ "$HITS" -eq 1 ]; then
  echo "secret-scan: FAILED — hits above. Do not make the repo public until resolved."
  exit 1
else
  echo "secret-scan: clean."
  exit 0
fi
