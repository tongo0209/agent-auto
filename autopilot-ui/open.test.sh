#!/bin/bash
# Self-test cho open.sh: dựng server thật trên cổng lạ, trình duyệt thay bằng file ghi URL.
# Chạy: bash autopilot-ui/open.test.sh   (exit 0 = pass hết)
HERE="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0

ok()   { pass=$((pass+1)); }
nope() { fail=$((fail+1)); printf 'FAIL  %s\n' "$1"; }

tmp=$(mktemp -d)
port=$((49000 + RANDOM % 1000))
printf '#!/bin/bash\necho "$1" >> %s/opened\n' "$tmp" > "$tmp/browser"
chmod +x "$tmp/browser"
export AUTOPILOT_UI_PORT=$port AUTOPILOT_UI_OPENER="$tmp/browser" AUTOPILOT_UI_LOG="$tmp/server.log"
listener() { lsof -nP -t -iTCP:"$port" -sTCP:LISTEN; }

bash "$HERE/open.sh"; code=$?
[ "$code" -eq 0 ] && ok || nope "lần mở đầu phải exit 0 (được $code) — log: $(tail -3 "$tmp/server.log")"
first=$(listener)
[ -n "$first" ] && ok || nope "chưa có server nghe cổng $port sau khi open.sh trả về"
grep -qx "http://127.0.0.1:$port" "$tmp/opened" && ok || nope "phải mở trình duyệt đúng http://127.0.0.1:$port — được: $(cat "$tmp/opened" 2>/dev/null)"

bash "$HERE/open.sh"
[ "$(listener)" = "$first" ] && ok || nope "server đang chạy thì mở lại không được dựng server thứ hai"
[ "$(wc -l < "$tmp/opened" | tr -d ' ')" = 2 ] && ok || nope "mở lại vẫn phải bật tab trình duyệt"

[ -n "$first" ] && kill "$first"
rm -rf "$tmp"
printf '%s pass · %s fail\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
