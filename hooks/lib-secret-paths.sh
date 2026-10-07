#!/bin/bash
# NGUỒN LUẬT DUY NHẤT cho "đường dẫn nào là secret" — guard-bash.sh và guard-read.sh cùng source file này,
# để không lặp regex ở 2 nơi rồi lệch nhau (bài học vocab.json: 3 nơi khai riêng = sai chắc chắn).
#
# is_secret_path "<chuỗi>" → return 0 nếu chuỗi có chứa đường dẫn credential.
# CỐ Ý KHÔNG tính: .env.test · .env.example · .env.dist · .env.sample (Symfony/new-mainsite commit .env.test,
# chặn là làm luồng tệ hơn), và .env.<gì đó> không phải .local/.prod.
# `process.env` (chữ đứng sát trước dấu chấm) là biến JS chứ không phải file.
is_secret_path() {
  local s
  s=$(printf '%s' "$1" | sed -E 's/[^[:space:]]*\.env[^[:space:]]*\.(example|sample|dist|template)//g')
  [[ $s =~ (^|[^a-zA-Z0-9_])\.env($|[^./a-zA-Z0-9_-]) ]] && return 0          # .env trần
  [[ $s =~ (^|[^a-zA-Z0-9_])\.env\.local ]] && return 0
  [[ $s =~ (^|[^a-zA-Z0-9_])\.env\.[a-z]+\.local ]] && return 0
  [[ $s =~ (^|[^a-zA-Z0-9_])\.env\.prod ]] && return 0
  [[ $s =~ id_rsa|id_ed25519|id_dsa ]] && return 0
  [[ $s =~ \.ssh/ ]] && return 0
  [[ $s =~ \.aws/credentials|\.npmrc|\.netrc ]] && return 0
  [[ $s =~ \.(pem|p12|pfx|jks|keystore|asc)($|[^a-zA-Z0-9]) ]] && return 0
  return 1
}
