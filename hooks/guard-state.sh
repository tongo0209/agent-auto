#!/bin/bash
# PostToolUse hook — chạy state-doctor NGAY khi state.json vừa bị ghi (bất kể ghi bằng tool nào).
#
# Vì sao cần: state.json chỉ do skill /daily ghi TAY. Field bỏ sót thì không có gì báo — 19/8/2026
# GW-779 thiếu `summary`, console render title thành "—" và USER là người phát hiện bằng mắt.
# `/daily doctor` có bắt được (E11) nhưng phải gõ tay mới chạy, nên thực tế không ai chạy.
# Vì sao PostToolUse mọi tool (kể cả Bash): state.json bị ghi bằng cả Edit lẫn python/jq trong Bash —
# gác theo tool_input.file_path là hở đúng đường hay dùng nhất.
# Vì sao so mtime: hook này chạy sau MỌI Bash/Edit; `stat` một file rẻ, còn nạp node thì không.
#
# exit 0 = im lặng · exit 2 = stderr trả về cho model tự sửa trong cùng lượt.
# Self-test: bash ~/.claude/hooks/guard-state.test.sh

link="${BASH_SOURCE[0]}"
while [ -L "$link" ]; do link=$(readlink "$link"); done
TOOLS="$(cd "$(dirname "$link")/../tools" && pwd)"
ROOT=${AGENT_AUTO_ROOT:-$(cd "$(dirname "$link")/.." && pwd)}
STATE="$ROOT/state.json"
STAMP="$HOME/.claude/hooks/.state-doctor.stamp"
[ -f "$STATE" ] || exit 0

mtime=$(stat -f %m "$STATE" 2>/dev/null || stat -c %Y "$STATE" 2>/dev/null)
[ -z "$mtime" ] && exit 0
[ "$mtime" = "$(cat "$STAMP" 2>/dev/null)" ] && exit 0
printf '%s' "$mtime" > "$STAMP" 2>/dev/null

report=$(node "$TOOLS/state-doctor.mjs" --root "$ROOT" 2>&1) && exit 0   # doctor exit 1 = có ERROR

printf '%s\t%s\n' "$(date '+%F %T')" "state-doctor sau khi ghi state.json" >> "$HOME/.claude/hooks/guard.log" 2>/dev/null
{
  echo "[guard-state] state.json vừa đổi và state-doctor báo ERROR — sửa NGAY trong lượt này, đừng để trôi:"
  echo ""
  printf '%s\n' "$report" | grep '^✖' | head -20
  echo ""
  echo "Mọi field đọc bởi console là hợp đồng: thiếu là user nhìn thấy ô trống, không phải crash."
  echo "Chi tiết từng mã lỗi: node tools/state-doctor.mjs"
} >&2
exit 2
