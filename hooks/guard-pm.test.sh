#!/bin/bash
# Self-test cho guard-pm.sh. Fixture + HOME + log đều ở thư mục tạm — không đụng repo nào, không ghi guard.log thật.
# Chạy: bash ~/.claude/hooks/guard-pm.test.sh   (exit 0 = pass hết)
HOOK="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)/guard-pm.sh"
KIT=${PM_KIT_DIR:-$HOME/VNG/git-vng/gt-promotion-template/standard-html-templates/ai-template-kit}
[ -d "$KIT/gameplays" ] || { echo "SKIP — không thấy ai-template-kit ở $KIT"; exit 0; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
LOG="$TMP/guard.log"
pass=0; fail=0

# Campaign đã khoá gameplay payment qua file dự án; bad = note ghi gameplay không hợp lệ.
CAMP="$TMP/products/g/landing/s"
mkdir -p "$TMP/projects/g" "$TMP/home"
printf '# g/s\n\n## 1. Khoá\n- gameplay: payment\n\n## 2. Nơi code\n' > "$TMP/projects/g/s.md"
printf '# g/bad\n\n## 1. Khoá\n- gameplay: fantasy\n\n## 2. Nơi code\n' > "$TMP/projects/g/bad.md"

run() { # $1=đường dẫn file  $2=nội dung → đặt $rc, $ctx (additionalContext ở stdout), $err (stderr + ctx)
  mkdir -p "$(dirname "$1")"
  printf '%s' "$2" > "$1"
  jq -nc --arg f "$1" '{tool_name:"Write",tool_input:{file_path:$f}}' \
    | HOME="$TMP/home" GUARD_LOG="$LOG" PM_PROJECTS_DIR="$TMP/projects" PM_KIT_DIR="$KIT" bash "$HOOK" >"$TMP/out" 2>"$TMP/err"
  rc=$?
  ctx=$(jq -r '.hookSpecificOutput.additionalContext // empty' "$TMP/out" 2>/dev/null)
  err="$(cat "$TMP/err")$ctx"
}

# warn phải đi qua additionalContext: stderr ở exit 0 thì model không thấy.
expect() { # $1=mong đợi (quiet|warn|block)  $2=tên ca  $3=chữ phải có  $4=chữ KHÔNG được có
  local got=quiet
  [ "$rc" -eq 2 ] && got=block
  [ "$rc" -eq 0 ] && [ -n "$ctx" ] && got=warn
  [ "$rc" -eq 0 ] && [ -z "$ctx" ] && [ -s "$TMP/err" ] && got=stderr-only
  if [ "$got" = "$1" ] && { [ -z "$3" ] || printf '%s' "$err" | grep -q -- "$3"; } && { [ -z "$4" ] || ! printf '%s' "$err" | grep -q -- "$4"; }; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); printf 'FAIL  mong %-5s nhan %-5s | %s\n' "$1" "$got" "$2"; printf '%s\n' "$err" | head -5 | sed 's/^/      /'
  fi
}

PAY_OK='<a href="#" class="pm__login">Đăng nhập</a>'

run "$CAMP/dup.html" '<div id="popup_login" class="pm__module pm__login-module"><div id="sso-login-form"></div><div id="sso-login-form"></div></div>'
expect block 'payment nhân đôi sso-login-form' 'PG-ONCE'

run "$CAMP/any.html" "$PAY_OK<any class=\"box\"></any>"
expect block 'còn thẻ <any>' 'PG-ANY'

run "$TMP/loose/index.html" "$PAY_OK"
expect block 'chưa khoá gameplay' 'PG-GAME'

OLD="$TMP/repo/products/g/landing/old"
mkdir -p "$OLD" && printf '%s' "$PAY_OK" > "$OLD/index.html"
git -C "$TMP/repo" init -q && git -C "$TMP/repo" add . \
  && git -C "$TMP/repo" -c user.email=t@t -c user.name=t commit -qm base
run "$OLD/index.html" "$PAY_OK<b>sửa</b>"
expect warn 'landing cũ chưa khoá → nhắc khoá, không chặn' 'R-PM-11'

run "$CAMP/warn.html" "$PAY_OK<span class=\"pm__rankchar-Rank\"></span>"
expect warn '🟡 hiện ra, không chặn' 'PG-UNKNOWN'

run "$CAMP/popup.twig" "{% if a %}<div id=\"sso-login-form\"></div>{% else %}<div id=\"sso-login-form\"></div>{% endif %}$PAY_OK<a class=\"pm__btn-claim\"></a>"
expect block '.twig chạy được, 2 nhánh if không tính trùng' 'PG-CLAIM' 'PG-ONCE'

run "$TMP/products/g/landing/bad/index.html" "$PAY_OK"
expect warn 'pm-gate lỗi dùng không bị nuốt' 'pm-gate lỗi dùng'

run "$CAMP/ok.html" "$PAY_OK"
expect quiet 'payment sạch'

run "$CAMP/plain.html" '<div class="box"><a href="#">Nhận</a></div>'
expect quiet 'file không có hook pm__'

run "$CAMP/dist/index.html" "$PAY_OK<any></any>"
expect quiet 'dist/ bỏ qua'

run "$CAMP/style.scss" '.pm__btn_claim { color: red; }'
expect quiet 'không phải html/twig'

if [ -s "$LOG" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo 'FAIL  ca chặn không ghi GUARD_LOG'; fi

printf '%s\n' "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
