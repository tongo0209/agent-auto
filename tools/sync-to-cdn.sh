#!/usr/bin/env bash
# Đồng bộ BẢN PHÁT HÀNH của agent-auto sang cdn-source/products/tontagent/agent-auto/
# — chỗ member đã có sẵn khi pull cdn-source.
#
#   bash tools/sync-to-cdn.sh --dry-run    # xem sẽ thay đổi gì (LUÔN chạy cái này trước)
#   bash tools/sync-to-cdn.sh              # đồng bộ thật
#   bash tools/sync-to-cdn.sh --dest <dir> # đích khác
#
# So sánh bằng --checksum (nội dung) chứ không theo mtime: checkout-index luôn ghi mtime mới
# nên nếu so mtime thì lần nào cũng báo "sửa hết 152 file", --dry-run thành vô dụng.
#
# Nguồn = ĐÚNG những file git đang track (git checkout-index). Nghĩa là mọi thứ trong
# .gitignore — state.json, config.json, boards/, tasks/, designs/, node_modules/ — KHÔNG
# bao giờ lọt sang. Muốn biết member nhận gì thì nhìn `git ls-files`, không phải nhìn đĩa.
#
# Script KHÔNG commit/push. Sau khi chạy, tự `git -C <cdn-source> status` rồi commit tay.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY=0; DEST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --dest)    DEST="${2:?--dest cần đường dẫn}"; shift 2 ;;
    *) echo "Tham số lạ: $1" >&2; exit 2 ;;
  esac
done

# Đích: --dest > config.json(repos.cdn-source) > đoán ~/VNG/git-vng/cdn-source
if [ -z "$DEST" ]; then
  cdn=""
  if [ -f "$REPO/config.json" ]; then
    cdn="$(node -e 'try{process.stdout.write(require(process.argv[1]).repos["cdn-source"]||"")}catch(e){}' "$REPO/config.json" 2>/dev/null || true)"
  fi
  [ -n "$cdn" ] || cdn="$HOME/VNG/git-vng/cdn-source"
  DEST="$cdn/products/tontagent/agent-auto"
fi

[ -d "$(dirname "$DEST")" ] || { echo "Không thấy thư mục cha của đích: $(dirname "$DEST")" >&2; exit 1; }
command -v rsync >/dev/null || { echo "Cần rsync" >&2; exit 1; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Lấy DANH SÁCH file từ git (nên .gitignore vẫn được tôn trọng tuyệt đối), nhưng lấy NỘI DUNG
# từ worktree. Bản đầu dùng `git checkout-index` — sai: nó đẩy bản trong INDEX, nên file nào
# đã `git add` rồi sửa tiếp (trạng thái `AM`) sẽ sang cdn-source ở bản CŨ hơn cái đang chạy.
# Đo 14/8: repo có 22 file `AM` ⇒ console bên cdn-source lệch bản thật mà không ai biết.
while IFS= read -r -d '' f; do
  mkdir -p "$STAGE/$(dirname "$f")"
  cp -p "$REPO/$f" "$STAGE/$f"
done < <(git -C "$REPO" ls-files -z)

n_src=$(find "$STAGE" -type f | wc -l | tr -d ' ')
echo "Nguồn : $REPO  ($n_src file git đang track — nội dung lấy từ worktree)"

# File chưa `git add` thì KHÔNG sang được. Im lặng bỏ qua là bẫy: người sửa tưởng đã phát hành.
untracked="$(git -C "$REPO" ls-files --others --exclude-standard)"
if [ -n "$untracked" ]; then
  echo ""
  echo "⚠ $(printf '%s\n' "$untracked" | wc -l | tr -d ' ') file chưa \`git add\` nên KHÔNG được phát hành:"
  printf '%s\n' "$untracked" | head -10 | sed 's|^|    |'
  [ "$(printf '%s\n' "$untracked" | wc -l)" -gt 10 ] && echo "    …"
fi
echo "Đích  : $DEST"
[ "$DRY" = 1 ] && echo "(--dry-run: không ghi gì)"
echo ""

mkdir -p "$DEST"
RS=(rsync -a --checksum --delete --itemize-changes "$STAGE/" "$DEST/")
[ "$DRY" = 1 ] && RS=(rsync -a --checksum --delete --itemize-changes --dry-run "$STAGE/" "$DEST/")

out="$("${RS[@]}")"
if [ -z "$out" ]; then
  echo "Không có gì đổi — đích đã khớp nguồn."
else
  echo "$out" | awk '
    /^\*deleting/ { d++; print "  XOÁ  " $2; next }
    /^>f\+\+\+\+\+\+\+/ { a++; print "  THÊM " $2; next }
    /^>f/           { m++; print "  SỬA  " $2; next }
    { next }
    END { }'
  # grep -c trả exit 1 khi đếm được 0 → phải nuốt, không thì `set -e` giết script
  echo ""
  printf '  tổng: %s thêm · %s sửa · %s xoá\n' \
    "$(printf '%s\n' "$out" | grep -c '^>f+++++++' || true)" \
    "$(printf '%s\n' "$out" | grep -c '^>f[^+]'    || true)" \
    "$(printf '%s\n' "$out" | grep -c '^\*deleting' || true)"
fi
echo ""
if [ "$DRY" = 1 ]; then
  echo "Chạy lại KHÔNG có --dry-run để ghi thật."
else
  GITROOT="$(git -C "$DEST" rev-parse --show-toplevel 2>/dev/null || true)"
  echo "Đã ghi. Kiểm rồi commit tay:"
  if [ -n "$GITROOT" ]; then
    echo "  git -C \"$GITROOT\" status --short -- \"${DEST#"$GITROOT"/}\""
  else
    echo "  (đích không nằm trong git repo nào: $DEST)"
  fi
fi
