#!/bin/zsh
# ⛔⛔ ĐÃ CHẾT — ĐỪNG GỌI (verify 2026-08-03). Giữ lại chỉ để tham chiếu lịch sử.
#   Lý do: đường clipboard Cmd+A/Cmd+C qua System Events không ăn trên máy này (thiếu quyền
#   Accessibility cho terminal) → clipboard giữ nguyên nội dung cũ của user → `exit 1`.
#   Thay bằng: scripts/sp-scan.js (quét đệ quy) chạy qua extension Claude in Chrome.
#   Ngoài ra script này chỉ đọc ĐÚNG 1 endpoint 1 CẤP — không đệ quy, nên kể cả còn chạy được
#   thì vẫn dẫn tới tải sót (ca GW-556: 8/56 file). Xem knowledge/lessons.md.
#
# Đọc 1 endpoint SharePoint REST bằng session Edge đã login (share link đã mở 1 lần).
# Cách hoạt động: mở URL trong Edge -> đưa tab đó lên frontmost -> Cmd+A/Cmd+C -> pbpaste.
# Dùng khi Graph/MCP mù (folder share bằng link không vào index của account).
# Usage: sp-rest.sh "<url>" "<file out>"
set -e
URL="$1"
OUT="${2:-/tmp/sp-rest-out.txt}"
MATCH="$(printf '%s' "$URL" | sed 's|.*/_api|_api|' | cut -c1-40)"

CLIP_BAK="$(mktemp)"
pbpaste > "$CLIP_BAK" 2>/dev/null || true

open -a "Microsoft Edge" "$URL"
sleep 8

/usr/bin/osascript <<AS >/dev/null 2>&1
tell application "Microsoft Edge"
  set found to false
  repeat with w from 1 to (count of windows)
    repeat with t from 1 to (count of tabs of window w)
      if URL of tab t of window w contains "/_api/" then
        set active tab index of window w to t
        set index of window w to 1
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
  activate
end tell
AS
sleep 2
/usr/bin/osascript -e 'tell application "System Events" to keystroke "a" using command down' \
                   -e 'delay 0.5' \
                   -e 'tell application "System Events" to keystroke "c" using command down' \
                   -e 'delay 1.0' >/dev/null 2>&1
pbpaste > "$OUT" 2>/dev/null || true

# đóng tab REST vừa mở, trả clipboard cũ
/usr/bin/osascript <<'AS2' >/dev/null 2>&1
tell application "Microsoft Edge"
  repeat with w from 1 to (count of windows)
    set n to count of tabs of window w
    repeat with t from n to 1 by -1
      if URL of tab t of window w contains "/_api/" then close tab t of window w
    end repeat
  end repeat
end tell
AS2
pbcopy < "$CLIP_BAK" 2>/dev/null || true
rm -f "$CLIP_BAK"

echo "đã lấy $(wc -c < "$OUT" | tr -d ' ') byte -> $OUT"
