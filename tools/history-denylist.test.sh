#!/usr/bin/env bash
# history-denylist.sh: history lớn hơn bộ đệm pipe vẫn phải bắt được chuỗi cấm (grep -q + pipefail từng báo "sạch")
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
FAIL=0
check() { if [ "$1" = "$2" ]; then echo "  ✓ $3"; else echo "  ✗ $3 (got $1, want $2)"; FAIL=1; fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
printf 'bi-mat-noi-bo\n' > "$TMP/deny.txt"
git init -q "$TMP/repo"
{ echo "bi-mat-noi-bo"; seq 1 200000; } > "$TMP/repo/big.txt"
git -C "$TMP/repo" add -A && git -C "$TMP/repo" -c commit.gpgsign=false -c user.email=t@t -c user.name=t commit -qm init
bash "$HERE/history-denylist.sh" "$TMP/repo" "$TMP/deny.txt" >/dev/null 2>&1
check $? 1 "history lớn có chuỗi cấm ⇒ exit 1"

printf 'khong-co-dau\n' > "$TMP/deny.txt"
bash "$HERE/history-denylist.sh" "$TMP/repo" "$TMP/deny.txt" >/dev/null 2>&1
check $? 0 "history sạch ⇒ exit 0"
exit $FAIL
