#!/usr/bin/env bash
# Exit 1 nếu git history của <repo> khớp <denylist>. Ghi ra file rồi mới grep: `git log | grep -q` dưới
# pipefail ăn SIGPIPE (141) đúng lúc khớp ⇒ báo "sạch" khi history lớn hơn bộ đệm pipe.
set -euo pipefail
repo="$1"; denylist="$2"
history="$(mktemp)"; trap 'rm -f "$history"' EXIT
git -C "$repo" log -p -- . ":(exclude)console/package-lock.json" > "$history"
if grep -IEq -f "$denylist" "$history"; then
  echo "❌ history khớp denylist:"; grep -IEo -f "$denylist" "$history" | sort -u | head -5
  exit 1
fi
