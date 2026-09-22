#!/bin/bash
# Self-test cho token-watch.sh — chạy: bash ~/.claude/hooks/token-watch.test.sh
set -uo pipefail
HOOK="$(dirname "$0")/token-watch.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

check() { # <tên> <kỳ vọng: warn|quiet> <transcript> [ngưỡng]
  local name="$1" expect="$2" file="$3" thr="${4:-200000}"
  local out
  out="$(printf '{"transcript_path":"%s"}' "$file" | CLAUDE_CTX_WARN="$thr" bash "$HOOK")"
  local got="quiet"; [ -n "$out" ] && got="warn"
  if [ "$got" = "$expect" ]; then pass=$((pass+1)); echo "  ✓ $name"
  else fail=$((fail+1)); echo "  ✗ $name — mong $expect, nhận $got${out:+ ($out)}"; fi
}

usage_line() { # <cache_read> <cache_create> <input>
  printf '{"message":{"usage":{"input_tokens":%s,"cache_creation_input_tokens":%s,"cache_read_input_tokens":%s,"output_tokens":9}}}\n' "$3" "$2" "$1"
}

echo "token-watch.sh"

usage_line 250000 1000 5 > "$TMP/over.jsonl"
check "context 251k > ngưỡng 200k ⇒ cảnh báo" warn "$TMP/over.jsonl"

usage_line 50000 1000 5 > "$TMP/under.jsonl"
check "context 51k < ngưỡng 200k ⇒ im" quiet "$TMP/under.jsonl"

check "ngưỡng hạ xuống 40k ⇒ cùng file đó cảnh báo" warn "$TMP/under.jsonl" 40000

# Cộng đủ 3 khoản: 150k + 60k + 1k = 211k, không khoản nào riêng lẻ vượt ngưỡng.
usage_line 150000 60000 1000 > "$TMP/sum.jsonl"
check "cộng cache_read + cache_create + input" warn "$TMP/sum.jsonl"

# Chỉ lượt CUỐI mới tính — lượt đầu to không được làm hook kêu mãi.
{ usage_line 900000 0 5; usage_line 30000 0 5; } > "$TMP/last.jsonl"
check "lấy lượt cuối, không lấy lượt đầu" quiet "$TMP/last.jsonl"

check "transcript không tồn tại ⇒ im, không lỗi" quiet "$TMP/khong-co-that.jsonl"

: > "$TMP/empty.jsonl"
check "transcript rỗng ⇒ im" quiet "$TMP/empty.jsonl"

printf 'dòng rác không phải json\n' > "$TMP/junk.jsonl"
check "transcript rác ⇒ im" quiet "$TMP/junk.jsonl"

out="$(printf '{}' | bash "$HOOK")"
if [ -z "$out" ]; then pass=$((pass+1)); echo "  ✓ payload thiếu transcript_path ⇒ im"
else fail=$((fail+1)); echo "  ✗ payload thiếu transcript_path ⇒ phải im"; fi

# Đuôi file phải đọc được kể cả transcript rất dài.
{ for _ in $(seq 1 5000); do usage_line 1000 0 5; done; usage_line 300000 0 5; } > "$TMP/big.jsonl"
check "transcript dài, lượt cuối vượt ngưỡng" warn "$TMP/big.jsonl"

echo
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
