#!/bin/bash
# Lệnh `ca` (bắt đầu team A) và `cB` (CLAUDE_FAILOVER_START=B): chạy Claude Code, team đang dùng hết limit thì
# hook limit-failover.sh tắt phiên và wrapper mở lại đúng phiên đó bằng team kia, nhắn nó làm tiếp.
# Team A = ~/.claude, team B = ~/.claude-teamB.
set -uo pipefail

CLAUDE_BIN="${CLAUDE_BIN:-claude}"
STATE="${CLAUDE_FAILOVER_DIR:-$HOME/.cache/claude-failover}"
TEAM_B_DIR="${CLAUDE_FAILOVER_B_DIR:-$HOME/.claude-teamB}"
LIMIT_WINDOW=$((5 * 3600))   # cửa sổ limit ngắn nhất; trong khoảng này coi team đó vẫn đang hết limit
PENDING="$STATE/pending.$$"

hit_recently() {
  local last; last="$(cat "$STATE/$1.last" 2>/dev/null || echo 0)"
  [ $(( $(date +%s) - last )) -lt "$LIMIT_WINDOW" ]
}
other_team() { [ "$1" = A ] && echo B || echo A; }

run_as() { # <team> <args claude...>
  local team="$1"; shift
  local config=(-u CLAUDE_CONFIG_DIR)
  [ "$team" = B ] && config=(CLAUDE_CONFIG_DIR="$TEAM_B_DIR")
  env "${config[@]}" CLAUDE_FAILOVER_TEAM="$team" CLAUDE_FAILOVER_PID=$$ CLAUDE_FAILOVER_DIR="$STATE" "$CLAUDE_BIN" "$@"
}

mkdir -p "$STATE"
rm -f "$PENDING"
team="${CLAUDE_FAILOVER_START:-A}"
hit_recently "$team" && ! hit_recently "$(other_team "$team")" && team="$(other_team "$team")"
run_as "$team" "$@"; rc=$?

while [ -f "$PENDING" ]; do
  read -r hit session error < "$PENDING"
  rm -f "$PENDING"
  team="$(other_team "$hit")"
  if hit_recently "$team"; then
    echo "⛔ Cả 2 team đều vừa hết limit. Khi có limit lại: ca --resume $session" >&2
    exit 1
  fi
  echo "⚡ Team $hit hết limit ($error) → mở lại phiên bằng team $team" >&2
  run_as "$team" --resume "$session" \
    "Lượt trước bị cắt vì team $hit hết limit ($error), phiên đã chuyển sang team $team. Làm tiếp đúng việc đang dở, không làm lại phần đã xong."
  rc=$?
done
exit "$rc"
