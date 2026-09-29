#!/bin/bash
# Self-test cho claude-failover.sh — chạy: bash tools/claude-failover.test.sh
set -uo pipefail
WRAPPER="$(dirname "$0")/claude-failover.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

# claude giả: ghi lại mỗi lần được gọi; lần thứ n nằm trong FAKE_LIMIT_ON thì làm y như hook limit-failover.sh.
cat > "$TMP/claude" <<'EOF'
#!/bin/bash
n=$(( $(cat "$LOG.count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$LOG.count"
echo "team=$CLAUDE_FAILOVER_TEAM dir=${CLAUDE_CONFIG_DIR:-none} args=$*" >> "$LOG"
if [[ " $FAKE_LIMIT_ON " == *" $n "* ]]; then
  date +%s > "$CLAUDE_FAILOVER_DIR/$CLAUDE_FAILOVER_TEAM.last"
  echo "$CLAUDE_FAILOVER_TEAM sess-$n rate_limit" > "$CLAUDE_FAILOVER_DIR/pending.$CLAUDE_FAILOVER_PID"
  exit 143
fi
exit 0
EOF
chmod +x "$TMP/claude"

run() { # <tên ca> <FAKE_LIMIT_ON> [args claude...]
  CASE="$TMP/$1"; mkdir -p "$CASE/state"; LOG="$CASE/log"; : > "$LOG"
  local limits="$2"; shift 2
  CLAUDE_CONFIG_DIR=/khong/duoc/lot/vao CLAUDE_BIN="$TMP/claude" CLAUDE_FAILOVER_DIR="$CASE/state" \
    CLAUDE_FAILOVER_B_DIR=/team-b LOG="$LOG" FAKE_LIMIT_ON="$limits" \
    bash "$WRAPPER" "$@" > "$CASE/out" 2>&1
  RC=$?
}
line() { sed -n "${1}p" "$LOG"; }
expect() { # <tên> <thực tế> <mong đợi>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ✓ $1"
  else fail=$((fail+1)); echo "  ✗ $1"; echo "      nhận: $2"; echo "      mong: $3"; fi
}

echo "claude-failover.sh"

run normal "" --model opus
expect "không hết limit ⇒ chạy 1 lần team A, giữ nguyên args" "$(cat "$LOG")" "team=A dir=none args=--model opus"
expect "không hết limit ⇒ trả mã thoát của claude" "$RC" "0"

run switch "1"
expect "team A hết limit ⇒ lần 2 chạy team B bằng config dir B" "$(line 2 | cut -d' ' -f1-2)" "team=B dir=/team-b"
expect "lần 2 resume đúng session bị cắt" "$(line 2 | cut -d' ' -f3-4)" "args=--resume sess-1"
expect "chỉ chạy 2 lần" "$(wc -l < "$LOG" | tr -d ' ')" "2"

run both "1 2"
expect "cả 2 team vừa hết limit ⇒ dừng sau lần 2" "$(wc -l < "$LOG" | tr -d ' ')" "2"
expect "cả 2 team hết limit ⇒ mã thoát 1" "$RC" "1"
grep -q "ca --resume sess-2" "$CASE/out" && { pass=$((pass+1)); echo "  ✓ in lệnh mở lại tay"; } \
  || { fail=$((fail+1)); echo "  ✗ thiếu lệnh mở lại tay: $(cat "$CASE/out")"; }

CASE="$TMP/startB"; mkdir -p "$CASE/state"; date +%s > "$CASE/state/A.last"
LOG="$CASE/log"; : > "$LOG"
CLAUDE_BIN="$TMP/claude" CLAUDE_FAILOVER_DIR="$CASE/state" CLAUDE_FAILOVER_B_DIR=/team-b LOG="$LOG" FAKE_LIMIT_ON="" \
  bash "$WRAPPER" > /dev/null 2>&1
expect "team A vừa hết limit trước đó ⇒ mở thẳng team B" "$(line 1 | cut -d' ' -f1)" "team=B"

# Ghép với hook thật: claude giả gọi limit-failover.sh như harness gọi StopFailure, rồi treo — hook phải tắt nó.
HOOK="$(dirname "$0")/../hooks/limit-failover.sh"
cat > "$TMP/claude-hook" <<EOF
#!/bin/bash
echo "team=\$CLAUDE_FAILOVER_TEAM args=\$*" >> "\$LOG"
if [ "\$CLAUDE_FAILOVER_TEAM" = A ]; then
  printf '{"session_id":"sess-real","error":"rate_limit"}' | CLAUDE_FAILOVER_NOTIFY=0 bash "$HOOK"
  sleep 30
fi
EOF
chmod +x "$TMP/claude-hook"
CASE="$TMP/real"; mkdir -p "$CASE/state"; LOG="$CASE/log"; : > "$LOG"
start=$(date +%s)
CLAUDE_BIN="$TMP/claude-hook" CLAUDE_FAILOVER_DIR="$CASE/state" CLAUDE_FAILOVER_B_DIR=/team-b LOG="$LOG" \
  bash "$WRAPPER" > /dev/null 2>&1
expect "hook thật tắt phiên A, wrapper resume bằng team B" "$(line 2 | cut -d' ' -f1-3)" "team=B args=--resume sess-real"
expect "không phải chờ phiên treo (tắt ngay)" "$(( $(date +%s) - start < 10 ))" "1"

echo
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
