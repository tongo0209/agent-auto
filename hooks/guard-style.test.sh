#!/bin/bash
# Self-test cho guard-style.sh. Fixture là chuỗi code, không file nào bị ghi.
# Chứng minh 2 chiều: bắt được comment thừa, và KHÔNG báo oan comment hợp lệ / file không thuộc phạm vi.
# Chạy: bash ~/.claude/hooks/guard-style.test.sh   (exit 0 = pass hết)
HOOK="$(cd "$(dirname "$0")" && pwd)/guard-style.sh"
pass=0; fail=0

check() { # $1=mong đợi (quiet|warn)  $2=tên ca  $3=file_path  $4=nội dung ghi
  local want="$1" name="$2" f="$3" c="$4" rc got
  jq -nc --arg f "$f" --arg c "$c" '{tool_name:"Write",tool_input:{file_path:$f,content:$c}}' \
    | bash "$HOOK" >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 2 ] && got=warn || got=quiet
  if [ "$got" = "$want" ]; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); printf 'FAIL  mong %-5s nhan %-5s | %s\n' "$want" "$got" "$name"
  fi
}

# --- Phải WARN: comment mô tả lại code, vượt ngưỡng 2 dòng ---
check warn 'js mô tả lại code' /a/src/main.js '// Lấy nút
const btn = document.querySelector(".btn");
// Gán sự kiện
btn.addEventListener("click", run);
// Chạy hàm chính
run();'

check warn 'scss chú thích từng khối' /a/src/style.scss '/* màu nền chính */
.a { color: red; }
/* padding hai bên */
.b { padding: 0 10px; }
/* căn giữa */
.c { margin: auto; }'

check warn 'html comment mô tả' /a/index.html '<!-- phần header -->
<div class="header"></div>
<!-- phần nội dung -->
<div class="body"></div>
<!-- phần chân trang -->
<div class="footer"></div>'

check warn 'twig comment mô tả' /a/tpl.twig '{# vòng lặp danh sách #}
{% for i in items %}
{# in tên #}
  {{ i.name }}
{# hết #}
{% endfor %}'

# --- Phải QUIET: 2 ngoại lệ hợp lệ của R-CS-1 ---
check quiet 'hợp đồng pm__' /a/src/main.js '// pm__btn-claim: hook JS platform, đổi tên = nút chết
const claim = document.querySelector(".pm__btn-claim");
// pm__popup-gift: platform tự mở, không tự toggle
const popup = document.querySelector(".pm__popup-gift");
// pm__input-server: name/id là hợp đồng, cấm đổi
const sv = document.querySelector(".pm__input-server");'

check quiet 'hack trình duyệt' /a/src/main.js '// Safari iOS <16 không fire click trên <label>
input.addEventListener("touchend", run);
// Chrome 120 tính sai 100vh khi có thanh địa chỉ
setVh();
// Firefox cần -moz- cho backdrop
applyBackdrop();'

check quiet 'nhiễu công cụ' /a/src/main.js '/* eslint-disable no-unused-vars */
// @ts-ignore
import x from "y";
/* stylelint-disable */
const a = 1;'

# --- Phải QUIET: dưới ngưỡng ---
check quiet 'chỉ 2 dòng comment' /a/src/main.js '// ghi chú một
const a = 1;
// ghi chú hai
const b = 2;'

# --- Phải QUIET: code sạch thật ---
check quiet 'zero comment' /a/src/main.js 'const VISIBLE_DAYS = 3;
document.querySelector(".pm__popup-claim").classList.add("active");
items.slice(0, VISIBLE_DAYS).forEach(render);'

# --- Phải QUIET: ngoài phạm vi (không phải file code, hoặc là output build) ---
check quiet 'file .md' /a/README.md '// một
// hai
// ba
// bốn'
check quiet 'trong dist/' /a/dist/main.js '// một
// hai
// ba
// bốn'
check quiet 'file .min.js' /a/src/lib.min.js '// một
// hai
// ba
// bốn'
check quiet 'node_modules' /a/node_modules/p/i.js '// một
// hai
// ba
// bốn'
check quiet 'webpack.config' /a/webpack.config.js '// một
// hai
// ba
// bốn'

printf '\nguard-style: %d pass, %d fail\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
