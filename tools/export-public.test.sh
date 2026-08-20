#!/bin/bash
# Self-test cho export-public.sh. Mỗi ca dựng 1 repo giả trong tmp — KHÔNG đụng repo thật.
# Chạy: bash tools/export-public.test.sh   (exit 0 = pass hết)
HERE="$(cd "$(dirname "$0")" && pwd)"
EXPORT="$HERE/export-public.sh"
pass=0; fail=0

ok()   { pass=$((pass+1)); }
nope() { fail=$((fail+1)); printf 'FAIL  %s\n' "$1"; }

fixture() { # in ra đường dẫn repo giả: 1 file được publish, 1 file bị loại
  local root; root=$(mktemp -d)
  mkdir -p "$root/src" "$root/noi-bo" "$root/publish/overrides"
  printf 'chay tren MAY-CUA-TOI, repo ACME-INTERNAL\n' > "$root/src/a.txt"
  printf 'bi mat\n' > "$root/noi-bo/b.txt"
  cat > "$root/publish/manifest.txt" <<'EOF'
- noi-bo/
- publish/
+ src/
EOF
  printf 'str\tMAY-CUA-TOI\t<may-ban>\nstr\tACME-INTERNAL\tpublic-repo\n' > "$root/publish/redactions.tsv"
  printf 'MAY-CUA-TOI\nACME-INTERNAL\n' > "$root/publish/denylist.txt"
  ( cd "$root" && git init -q && git add -A && git -c commit.gpgsign=false commit -qm init )
  printf '%s' "$root"
}

run() { # run <repo> <out> [thêm tham số] → in stdout+stderr, trả exit code
  local repo="$1" out="$2"; shift 2
  bash "$EXPORT" --repo "$repo" --out "$out" --skip-tests "$@" 2>&1
}

# ── Ca 1: đường thẳng — file được publish đã redact, file bị loại không có mặt ──
R=$(fixture); O=$(mktemp -d)/out
out=$(run "$R" "$O"); rc=$?
[ "$rc" -eq 0 ] || nope "ca1 export phải thành công: $out"
[ -f "$O/src/a.txt" ] && ok || nope "ca1 thiếu file được publish"
[ -e "$O/noi-bo" ] && nope "ca1 file bị loại vẫn lọt ra" || ok
grep -q '<may-ban>' "$O/src/a.txt" 2>/dev/null && ok || nope "ca1 chưa áp redaction"
grep -q 'MAY-CUA-TOI' "$O/src/a.txt" 2>/dev/null && nope "ca1 còn chuỗi nội bộ" || ok
[ "$(cd "$O" && git rev-list --count HEAD 2>/dev/null)" = 1 ] && ok || nope "ca1 phải có đúng 1 commit"

# ── Ca 2: file chưa phân loại ⇒ DỪNG, không sinh gì ──
R=$(fixture); printf 'x\n' > "$R/chua-phan-loai.txt"; O=$(mktemp -d)/out
out=$(run "$R" "$O"); rc=$?
[ "$rc" -ne 0 ] && ok || nope "ca2 phải fail khi có file chưa phân loại"
echo "$out" | grep -q 'chưa được phân loại' && ok || nope "ca2 thông báo phải nói rõ lý do"
[ -e "$O" ] && nope "ca2 fail rồi mà vẫn tạo thư mục đích" || ok

# ── Ca 3: redaction bỏ sót ⇒ cổng denylist chặn ──
R=$(fixture); O=$(mktemp -d)/out
printf 'str\tMAY-CUA-TOI\t<may-ban>\n' > "$R/publish/redactions.tsv"   # bỏ rule ACME-INTERNAL
out=$(run "$R" "$O"); rc=$?
[ "$rc" -ne 0 ] && ok || nope "ca3 phải fail khi denylist còn hit"
echo "$out" | grep -q 'denylist' && ok || nope "ca3 phải nói là cổng denylist chặn"

# ── Ca 4: đích đã tồn tại ⇒ không đè ──
R=$(fixture); O=$(mktemp -d)/out; mkdir -p "$O"; printf 'cua toi\n' > "$O/dung-xoa.txt"
out=$(run "$R" "$O"); rc=$?
[ "$rc" -ne 0 ] && ok || nope "ca4 phải fail khi đích đã tồn tại"
[ -f "$O/dung-xoa.txt" ] && ok || nope "ca4 KHÔNG được xoá dữ liệu ở đích"

# ── Ca 5: overrides thay hẳn file sau khi copy ──
R=$(fixture); O=$(mktemp -d)/out
mkdir -p "$R/publish/overrides/src"; printf 'ban da duoc thay\n' > "$R/publish/overrides/src/a.txt"
run "$R" "$O" >/dev/null
grep -q 'ban da duoc thay' "$O/src/a.txt" 2>/dev/null && ok || nope "ca5 override không được áp"

printf '%d pass · %d fail\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
