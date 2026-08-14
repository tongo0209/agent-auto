#!/bin/zsh
# Cài/gỡ radar nền (launchd → tools/radar-tick.mjs).
# Dùng: tools/radar-install.sh [install|uninstall|status|kick]
#
# Tắt TẠM thì đừng gỡ ở đây — sửa config.radar.enabled=false (hoặc bấm nút trên console) là
# tick vẫn nổ đúng nhịp rồi thoát ngay ở cổng giờ, hoàn tác được bằng 1 khoá JSON.
set -e
LABEL=com.tont.agent-auto.radar
SRC="$(cd "$(dirname "$0")" && pwd)/radar-agent.plist"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

case "${1:-install}" in
  install)
    # GỢI Ý (không tự sửa hộ): radar-agent.plist ghi CỨNG đường dẫn agent-auto ở 4 dòng.
    # Máy nào clone chỗ khác mà cứ cài thì launchd `cd` vào thư mục không tồn tại rồi chết
    # ÂM THẦM — `launchctl print` vẫn thấy job, chỉ có `last exit` khác 0. Nên cảnh báo ngay ở
    # đây, chỗ người ta sẽ đọc, thay vì để họ chờ 60 phút rồi tự hỏi sao radar không nhả nhịp.
    HERE="$(cd "$(dirname "$0")/.." && pwd)"
    if ! grep -q "<string>$HERE</string>" "$SRC"; then
      echo "⚠ radar-agent.plist đang trỏ vào đường dẫn của máy khác, KHÔNG phải $HERE"
      echo "  Sửa 4 dòng có đường dẫn trong $SRC rồi chạy lại lệnh này:"
      grep -n "VNG/agent-auto" "$SRC" | sed 's/^/    /'
      echo "  (chưa cài gì cả — dừng ở đây cho an toàn)"
      exit 1
    fi
    cp "$SRC" "$DEST"
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$DEST"
    echo "đã cài $LABEL"
    launchctl print "$DOMAIN/$LABEL" | grep -E '^\s*(state|runs|last exit)' || true
    ;;
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$DEST"
    echo "đã gỡ $LABEL"
    ;;
  kick)
    launchctl kickstart -k "$DOMAIN/$LABEL"
    echo "đã đá 1 nhịp — xem history/radar.jsonl sau ~60s"
    ;;
  status)
    launchctl print "$DOMAIN/$LABEL" | grep -E '^\s*(state|runs|last exit|program)' || echo "chưa cài"
    ;;
  *)
    echo "dùng: $0 [install|uninstall|status|kick]" >&2
    exit 2
    ;;
esac
