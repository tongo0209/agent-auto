#!/bin/bash
# Self-test cho guard-state.sh. Mỗi ca dựng 1 agent-auto giả trong tmp (AGENT_AUTO_ROOT) —
# KHÔNG đụng state.json thật của user.
# Chạy: bash ~/.claude/hooks/guard-state.test.sh   (exit 0 = pass hết)
self="$0"; while [ -L "$self" ]; do self=$(readlink "$self"); done   # gọi qua symlink ~/.claude/hooks
HERE="$(cd "$(dirname "$self")" && pwd)"
HOOK="$HERE/guard-state.sh"
pass=0; fail=0

fixture() { # $1 = JSON state.json
  local root; root=$(mktemp -d)
  printf '%s' "$1" > "$root/state.json"
  printf '{"cloudId":"abc-123","gitAuthor":"ai@vng.com.vn","repos":{"cdn-source":"%s"}}' "$root" > "$root/config.json"
  printf '%s' "$root"
}

check() { # $1=mong đợi (quiet|warn)  $2=tên ca  $3=root  $4=stamp giả (rỗng = không có)
  local want="$1" name="$2" root="$3" stamp="$4" rc got
  export HOME_BAK="$HOME"; HOME=$(mktemp -d); mkdir -p "$HOME/.claude/hooks"
  [ -n "$stamp" ] && printf '%s' "$stamp" > "$HOME/.claude/hooks/.state-doctor.stamp"
  AGENT_AUTO_ROOT="$root" bash "$HOOK" </dev/null >/dev/null 2>&1
  rc=$?
  HOME="$HOME_BAK"
  [ "$rc" -eq 2 ] && got=warn || got=quiet
  if [ "$got" = "$want" ]; then pass=$((pass+1));
  else fail=$((fail+1)); printf 'FAIL  mong %-5s nhan %-5s | %s\n' "$want" "$got" "$name"; fi
}

OK='{"schemaVersion":2,"issues":{"GW-1":{"phase":"coding","summary":"[C19][ANANTA] Landing pre-register","milestones":{"html":"2026-08-10"},"paths":[{"repo":"cdn-source","path":"."}]}}}'
NOSUM='{"schemaVersion":2,"issues":{"GW-1":{"phase":"coding","milestones":{"html":"2026-08-10"},"paths":[{"repo":"cdn-source","path":"."}]}}}'

check warn  'thiếu summary → báo (chính ca GW-779 19/8)'      "$(fixture "$NOSUM")"
check quiet 'state đủ field → im lặng'                        "$(fixture "$OK")"
check warn  'phase lạ (E1) cũng chặn, không riêng summary'     "$(fixture "${NOSUM/coding/gi-vay-troi}")"

# mtime chưa đổi thì không nạp node — cổng rẻ này là điều kiện để hook bám được vào MỌI Bash call
ROOT=$(fixture "$NOSUM")
check quiet 'mtime khớp stamp → bỏ qua, không chạy doctor' "$ROOT" "$(stat -f %m "$ROOT/state.json")"

check quiet 'không có state.json → im lặng' "$(mktemp -d)"

printf '\n%d pass · %d fail\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
