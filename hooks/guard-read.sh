#!/bin/bash
# PreToolUse hook cho Read/Grep — chặn ĐỌC file credential bằng tool (đường mà guard-bash không với tới).
# Dùng chung luật với guard-bash.sh qua lib-secret-paths.sh.
# Vì sao không dùng permissions.deny: pattern tương đối trong user-settings không khớp path tuyệt đối
# (đã test thật 2026-08-13: "Read(**/.env)" KHÔNG chặn /private/tmp/.../.env).
# Self-test: bash ~/.claude/hooks/guard-read.test.sh

source "$(dirname "${BASH_SOURCE[0]}")/lib-secret-paths.sh"

target=$(cat | jq -r '[.tool_input.file_path, .tool_input.path, .tool_input.notebook_path] | map(select(. != null)) | join(" ")' 2>/dev/null)
[ -z "$target" ] && exit 0

if is_secret_path "$target"; then
  printf '%s\tdeny\tG-SECRET-2\t%s\n' "$(date '+%F %T')" "$target" >> "$HOME/.claude/hooks/guard.log" 2>/dev/null
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[guard-read G-SECRET-2] file credential - .env.test/.env.example thi doc duoc, ban nay khong"}}\n'
fi
exit 0
