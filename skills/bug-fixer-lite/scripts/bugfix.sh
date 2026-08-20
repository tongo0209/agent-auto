#!/usr/bin/env bash
# bugfix.sh — mở phiên Claude Code ở effort tối ưu cho RIÊNG skill này rồi gọi bug-fixer-lite.
#
#   bash scripts/bugfix.sh <link sheet | file | text>
#   bash scripts/bugfix.sh turbo <link sheet>
#   bash scripts/bugfix.sh report                 # chạy lại riêng bước ghi sheet
#   BFL_EFFORT=low bash scripts/bugfix.sh <...>   # ép nhanh hơn nữa cho buglist đã quen
#   BFL_EFFORT=xhigh bash scripts/bugfix.sh <...> # buglist khó / project mới / ranh giới nhạy
#   BFL_DRYRUN=1 bash scripts/bugfix.sh <...>      # chỉ in lệnh sẽ chạy, không mở phiên
#
# Vì sao phải làm ở tầng PHIÊN chứ không trong skill: effort là tham số của phiên. Tool `Agent`
# (skill dùng để dispatch lane/checker) KHÔNG có tham số effort, nên skill không tự đặt được; và
# main-loop manager — chiếm 63–81% out token — luôn chạy ở effort của phiên. Đặt effort cho riêng
# subagent (nếu được) cũng chỉ với tới ~20–35% chi phí, bỏ sót đúng chỗ nghẽn.
#
# Mặc định `medium` theo số đo 2026-07-30 (13+ vòng, fixture có ground truth):
#   xhigh  → 21m20s–24m13s · $8.83–11.33
#   medium → 10m49s        · $5.30        ← cùng điểm 25/25, nhanh ~2× rẻ ~40%
#   low    →  9m06s–10m01s · $4.69–5.36   ← chỉ hơn medium ~10% (trong biên dao động),
#                                            nhưng là bậc mà 2 lỗi "bỏ bước sổ sách" từng xuất hiện
set -euo pipefail

EFFORT="${BFL_EFFORT:-medium}"

if [ $# -eq 0 ]; then
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 1
fi

command -v claude >/dev/null || { echo "❌ không thấy lệnh 'claude' trên PATH"; exit 1; }

echo "▶ effort=$EFFORT (áp cho phiên này thôi)"
if [ -n "${BFL_DRYRUN:-}" ]; then
  printf '%s\n' "claude --effort $EFFORT \"/bug-fixer-lite $*\""   # in lệnh, không chạy
  exit 0
fi
exec claude --effort "$EFFORT" "/bug-fixer-lite $*"
