#!/bin/bash
# Self-test cho guard-pm.sh. Fixture ghi vào thư mục tạm rồi xoá — không đụng repo nào.
# Chứng minh 2 chiều: bắt được hook nhân đôi, và KHÔNG lên tiếng với file ngoài phạm vi.
# Chạy: bash ~/.claude/hooks/guard-pm.test.sh   (exit 0 = pass hết)
HOOK="$(cd "$(dirname "$0")" && pwd)/guard-pm.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

check() { # $1=mong đợi (quiet|warn)  $2=tên ca  $3=tên file  $4=nội dung
  local want="$1" name="$2" f="$TMP/$3" rc got
  printf '%s' "$4" > "$f"
  jq -nc --arg f "$f" '{tool_name:"Write",tool_input:{file_path:$f}}' | bash "$HOOK" >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 2 ] && got=warn || got=quiet
  if [ "$got" = "$want" ]; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); printf 'FAIL  mong %-5s nhan %-5s | %s\n' "$want" "$got" "$name"
  fi
}

PAY_OK='<section id="popup_signIn"><form id="sso-login-form"></form></section>
<a class="btn pm__btn_claim">Nhận</a><span class="pm__totalCash">0</span>'

check warn 'payment nhân đôi id sso-login-form' dup.html "$PAY_OK
<form id=\"sso-login-form\"></form>"

check warn 'còn thẻ <any> chưa thay' any.html "$PAY_OK
<any class=\"box\"></any>"

check quiet 'payment sạch' ok.html "$PAY_OK"
check quiet 'file không có hook pm__' plain.html '<div class="box"><a href="#">Nhận</a></div>'
check quiet 'không rõ gameplay — ngoài phạm vi kit' unknown.html '<div class="pm__login"></div>'
check quiet 'không phải html/twig' style.scss '.pm__btn_claim { color: red; }'

printf '%s\n' "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
