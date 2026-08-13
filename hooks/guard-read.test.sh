#!/bin/bash
# Self-test cho guard-read.sh — các path dưới là FIXTURE, không file nào bị đọc.
# Chạy: bash ~/.claude/hooks/guard-read.test.sh
HOOK="$(cd "$(dirname "$0")" && pwd)/guard-read.sh"
pass=0; fail=0

check() { # $1=allow|deny  $2=tool  $3=path
  local want="$1" tool="$2" p="$3" out got
  out=$(jq -nc --arg t "$tool" --arg p "$p" '{tool_name:$t,tool_input:(if $t=="Grep" then {path:$p,pattern:"x"} else {file_path:$p} end)}' | bash "$HOOK")
  if [ -z "$out" ]; then got=allow; else got=$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision'); fi
  if [ "$got" = "$want" ]; then pass=$((pass+1)); else fail=$((fail+1)); printf 'FAIL mong %-5s nhan %-5s | %s %s\n' "$want" "$got" "$tool" "$p"; fi
}

# Phải ALLOW — file làm việc bình thường
check allow Read '/Users/lap17727/VNG/git-vng/new-mainsite/.env.test'
check allow Read '/Users/lap17727/VNG/git-vng/cdn-source/products/jxm/landing/2026/config.js'
check allow Read '/Users/lap17727/VNG/agent-auto/state.json'
check allow Read '/Users/lap17727/VNG/git-vng/new-mainsite/templates/abm/layout/index.html.twig'
check allow Read '/Users/lap17727/VNG/agent-auto/boards/2026-08-13.md'
check allow Read '/tmp/x/.env.example'
check allow Read '/tmp/x/.env.dist'
check allow Grep '/Users/lap17727/VNG/git-vng/new-mainsite/templates'

# Phải DENY — credential
check deny Read '/Users/lap17727/VNG/git-vng/new-mainsite/.env'
check deny Read '/tmp/x/.env.local'
check deny Read '/tmp/x/.env.production.local'
check deny Read '/Users/lap17727/.ssh/id_rsa'
check deny Read '/Users/lap17727/.ssh/config'
check deny Read '/Users/lap17727/.aws/credentials'
check deny Read '/Users/lap17727/.npmrc'
check deny Read '/srv/cert/server.pem'
check deny Grep '/Users/lap17727/VNG/git-vng/new-mainsite/.env'

printf '\n%d pass · %d fail\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
