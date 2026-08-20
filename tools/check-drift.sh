#!/usr/bin/env bash
# Soát các skill/agent được COPY vào repo này có còn khớp bản gốc không.
#
#   bash tools/check-drift.sh
#
# Nguồn gốc khai trong publish/bundled-sources.tsv (cột 3 = "patched" nếu đã sửa có chủ ý). Máy không có repo gốc thì bỏ qua im lặng —
# đó là ca của người ngoài team, không phải lỗi. Script KHÔNG tự đồng bộ: đè bản nào là quyết
# định của người, vì cả hai phía đều có thể là bản mới hơn.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSV="$REPO/publish/bundled-sources.tsv"
[ -f "$TSV" ] || { echo "❌ thiếu publish/bundled-sources.tsv"; exit 2; }

same=0; drift=0; skip=0; patched=0
while IFS="$(printf '\t')" read -r here origin note; do
  case "$here" in ('' | '#'*) continue ;; esac
  src="${origin/#\~/$HOME}"
  if [ ! -e "$src" ]; then skip=$((skip+1)); continue; fi
  if diff -rq --exclude=.DS_Store "$REPO/$here" "$src" >/dev/null 2>&1; then
    same=$((same+1))
  elif [ "${note:-}" = "patched" ]; then
    patched=$((patched+1))
    printf '  \033[36m~\033[0m %s — lệch CÓ CHỦ Ý (cột 3 = patched)\n' "$here"
  else
    drift=$((drift+1))
    printf '  \033[33m≠\033[0m %s\n' "$here"
    diff -rq --exclude=.DS_Store "$REPO/$here" "$src" 2>&1 | sed 's/^/      /' | head -5
  fi
done < "$TSV"

printf '%d khớp · %d lệch có chủ ý · %d LỆCH · %d bỏ qua (không có repo gốc trên máy)\n' "$same" "$patched" "$drift" "$skip"
[ "$drift" -eq 0 ]
