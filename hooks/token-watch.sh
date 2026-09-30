#!/bin/bash
# G-CTX-1: context phiên vượt ngưỡng thì nhắc chốt việc ra file trước khi auto-compact. Chi phí tăng theo bình phương độ dài phiên
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
printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"[G-CTX-1] Context phiên đang ~%sk token (ngưỡng %sk). Phiên sẽ tự compact khi chạm autoCompactWindow (300k) — KHÔNG nhắc user /clear. Việc nhiều pha đang dở: ghi kết quả trung gian (board, file:line, lệnh verify) ra file trước để bản tóm tắt compact không làm rơi."}}\n' "$k" "$((WARN / 1000))"
exit 0
