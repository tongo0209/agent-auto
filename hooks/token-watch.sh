#!/bin/bash
# G-CTX-1: context phiên vượt ngưỡng thì nhắc cắt phiên. Chi phí tăng theo bình phương độ dài phiên
# vì toàn bộ context được gửi lại mỗi lượt. Hook UserPromptSubmit, không chặn — chỉ chèn nhắc.
set -uo pipefail

WARN="${CLAUDE_CTX_WARN:-200000}"
payload="$(cat)"

transcript="$(printf '%s' "$payload" | sed -n 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

# Chỉ đọc đuôi file: transcript phiên dài lên tới hàng trăm MB.
ctx="$(tail -c 400000 "$transcript" 2>/dev/null | grep '"usage"' | tail -1 | awk '
  function num(field,   pfx) {
    pfx = length(field) + 3                       # "field":  → 2 dấu nháy + dấu hai chấm
    if (match($0, "\"" field "\":[0-9]+")) return substr($0, RSTART + pfx, RLENGTH - pfx)
    return 0
  }
  { print num("cache_read_input_tokens") + num("cache_creation_input_tokens") + num("input_tokens") }')"

case "$ctx" in ''|*[!0-9]*) exit 0 ;; esac
[ "$ctx" -gt "$WARN" ] || exit 0

k=$((ctx / 1000))
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"[G-CTX-1] Context phiên đang ~%sk token (ngưỡng %sk). Mỗi lượt từ đây gửi lại toàn bộ chỗ đó. Xong pha hiện tại thì nhắc user /clear trước khi sang việc mới — trừ khi việc đang làm cần đúng ngữ cảnh này."}}\n' "$k" "$((WARN / 1000))"
exit 0
