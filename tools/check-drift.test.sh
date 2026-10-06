#!/bin/bash
# Self-test cho check-drift.sh. Dựng repo giả trong tmp — KHÔNG đụng repo thật.
# Chạy: bash tools/check-drift.test.sh   (exit 0 = pass hết)
HERE="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0

ok()   { pass=$((pass+1)); }
nope() { fail=$((fail+1)); printf 'FAIL  %s\n' "$1"; }

fixture() { # repo giả có 3 mục: 2 lệch, 1 khớp; nguồn gốc nằm ở <root>/origin
  local root; root=$(mktemp -d)
  mkdir -p "$root/repo/tools" "$root/repo/publish" "$root/origin"
  cp "$HERE/check-drift.sh" "$root/repo/tools/"
  for name in a b c; do
    printf 'goc\n' > "$root/origin/$name.md"
    printf 'goc\n' > "$root/repo/$name.md"
  done
  printf 'sua\n' > "$root/repo/a.md"
  printf 'sua\n' > "$root/repo/b.md"
  printf 'a.md\t%s/origin/a.md\nb.md\t%s/origin/b.md\nc.md\t%s/origin/c.md\n' "$root" "$root" "$root" > "$root/repo/publish/bundled-sources.tsv"
  printf '%s' "$root"
}

root=$(fixture)
out=$(bash "$root/repo/tools/check-drift.sh" 2>&1); code=$?
grep -q 'b.md' <<<"$out" && ok || nope "mục lệch thứ 2 phải được báo (script không được chết ở mục lệch đầu)"
grep -q '1 khớp · 0 lệch có chủ ý · 2 LỆCH' <<<"$out" && ok || nope "phải in dòng tổng kết đếm đủ 3 mục — được: $out"
[ "$code" -eq 1 ] && ok || nope "còn LỆCH ⇒ exit 1 (được $code)"

printf 'a.md\t%s/origin/a.md\tpatched\nb.md\t%s/origin/b.md\tpatched\nc.md\t%s/origin/c.md\n' "$root" "$root" "$root" > "$root/repo/publish/bundled-sources.tsv"
out=$(bash "$root/repo/tools/check-drift.sh" 2>&1); code=$?
grep -q '1 khớp · 2 lệch có chủ ý · 0 LỆCH' <<<"$out" && ok || nope "patched không tính LỆCH — được: $out"
[ "$code" -eq 0 ] && ok || nope "chỉ lệch có chủ ý ⇒ exit 0 (được $code)"
rm -rf "$root"

printf 'pass=%d fail=%d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
