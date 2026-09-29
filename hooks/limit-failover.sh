#!/bin/bash
# Hook StopFailure (matcher rate_limit|billing_error): team đang dùng hết limit thì ghi cờ rồi tắt phiên,
# để tools/claude-failover.sh mở lại đúng phiên đó bằng team kia. Chạy claude trần (không qua wrapper) thì im.
set -uo pipefail

team="${CLAUDE_FAILOVER_TEAM:-}"
wrapper="${CLAUDE_FAILOVER_PID:-}"
[ -n "$team" ] && [ -n "$wrapper" ] || exit 0

payload="$(cat)"
field() { printf '%s' "$payload" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1; }
session="$(field session_id)"
[ -n "$session" ] || exit 0

state="${CLAUDE_FAILOVER_DIR:-$HOME/.cache/claude-failover}"
mkdir -p "$state"
date +%s > "$state/$team.last"
printf '%s %s %s\n' "$team" "$session" "$(field error)" > "$state/pending.$wrapper"

if [ "${CLAUDE_FAILOVER_NOTIFY:-1}" = 1 ]; then
  osascript -e "display notification \"Team $team hết limit — đang chuyển team\" with title \"Claude Code\"" 2>/dev/null
fi
pkill -TERM -a -P "$wrapper"   # -a: phiên claude là tổ tiên của hook, macOS mặc định bỏ qua tổ tiên
exit 0
