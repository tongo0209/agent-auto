#!/bin/bash
# Self-test cho limit-failover.sh — chạy: bash ~/.claude/hooks/limit-failover.test.sh
set -uo pipefail
HOOK="$(dirname "$0")/limit-failover.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

ok()  { pass=$((pass+1)); echo "  ✓ $1"; }
bad() { fail=$((fail+1)); echo "  ✗ $1"; }

payload='{"session_id":"sess-123","hook_event_name":"StopFailure","error":"rate_limit"}'

# Giả lập wrapper claude-failover.sh: 1 tiến trình cha có đúng 1 con "claude" đang chạy.
spawn_wrapper() {
  bash -c 'sleep 30 & wait' &
  WRAPPER=$!
  sleep 0.3
  CHILD="$(pgrep -P "$WRAPPER" | head -1)"
}

echo "limit-failover.sh"

state="$TMP/s1"
spawn_wrapper
printf '%s' "$payload" | CLAUDE_FAILOVER_DIR="$state" CLAUDE_FAILOVER_TEAM=A CLAUDE_FAILOVER_PID="$WRAPPER" \
  CLAUDE_FAILOVER_NOTIFY=0 bash "$HOOK"
[ "$(cat "$state/pending.$WRAPPER" 2>/dev/null)" = "A sess-123 rate_limit" ] \
  && ok "ghi cờ pending.<pid> = team + session + lỗi" || bad "cờ pending sai: $(cat "$state/pending.$WRAPPER" 2>&1)"
[[ "$(cat "$state/A.last" 2>/dev/null)" =~ ^[0-9]+$ ]] && ok "ghi mốc giờ A.last" || bad "thiếu A.last"
sleep 0.3
kill -0 "$CHILD" 2>/dev/null && bad "phiên claude (con của wrapper) phải bị tắt" || ok "tắt phiên claude con của wrapper"
kill "$WRAPPER" 2>/dev/null; wait "$WRAPPER" 2>/dev/null

state="$TMP/s2"
spawn_wrapper
printf '%s' "$payload" | CLAUDE_FAILOVER_DIR="$state" CLAUDE_FAILOVER_NOTIFY=0 bash "$HOOK"
[ -e "$state" ] && bad "chạy claude trần (không qua wrapper) phải im" || ok "không qua wrapper ⇒ không ghi gì"
kill -0 "$CHILD" 2>/dev/null && ok "không qua wrapper ⇒ không tắt phiên nào" || bad "không được tắt phiên khi không qua wrapper"
kill "$WRAPPER" 2>/dev/null; wait "$WRAPPER" 2>/dev/null

state="$TMP/s3"
printf '{}' | CLAUDE_FAILOVER_DIR="$state" CLAUDE_FAILOVER_TEAM=B CLAUDE_FAILOVER_PID=999999 CLAUDE_FAILOVER_NOTIFY=0 bash "$HOOK"
[ -e "$state/pending.999999" ] && bad "payload thiếu session_id phải im" || ok "payload thiếu session_id ⇒ im, không lỗi"

echo
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
