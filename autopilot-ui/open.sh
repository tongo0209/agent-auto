#!/bin/bash
# Mở console autopilot: chưa chạy thì bật server nền rồi mở trình duyệt. Đóng tab cuối là server tự tắt.
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT=${AUTOPILOT_UI_PORT:-4800}
URL="http://127.0.0.1:$PORT"
LOG=${AUTOPILOT_UI_LOG:-$HOME/VNG/agent-auto/history/autopilot-ui.log}
READY_TRIES=40

# Bấm từ app/Spotlight không qua .zshrc: không nạp nvm thì nhặt nhầm node Homebrew (vỡ libllhttp)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null

is_up() { curl -fs -o /dev/null "$URL/api/autopilot/runs"; }

if ! is_up; then
  nohup node "$HERE/server.mjs" >> "$LOG" 2>&1 < /dev/null &
  for _ in $(seq "$READY_TRIES"); do
    is_up && break
    sleep 0.25
  done
  is_up || { echo "Server không lên — xem $LOG:"; tail -5 "$LOG"; exit 1; }
fi

"${AUTOPILOT_UI_OPENER:-open}" "$URL"
