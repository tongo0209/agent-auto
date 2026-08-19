#!/usr/bin/env bash
# Cài skill + hook của agent-auto vào Claude Code cho MỘT máy.
#
# Cách làm: symlink từ ~/.claude/ vào repo này — KHÔNG copy. Nhờ vậy `git pull` là
# skill mới có ngay, và sửa skill = sửa file trong repo (commit được).
#
#   bash tools/install-skills.sh            # cài
#   bash tools/install-skills.sh --check    # chỉ kiểm tra, không đụng gì
#
# Script KHÔNG xoá gì và KHÔNG sửa settings.json của bạn. Gặp thư mục thật trùng tên
# thì đổi tên thành <tên>.bak-<n> rồi mới link, và in ra để bạn tự xử.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CHECK_ONLY=0; WRITE_HOOKS=0
for a in "$@"; do
  case "$a" in
    --check)       CHECK_ONLY=1 ;;
    --write-hooks) WRITE_HOOKS=1 ;;
    *) echo "Tham số lạ: $a  (dùng: --check | --write-hooks)" >&2; exit 2 ;;
  esac
done

ok=0; changed=0; warn=0
say()  { printf '%s\n' "$*"; }
good() { printf '  \033[32m✓\033[0m %s\n' "$*"; ok=$((ok+1)); }
add()  { printf '  \033[36m+\033[0m %s\n' "$*"; changed=$((changed+1)); }
bad()  { printf '  \033[33m!\033[0m %s\n' "$*"; warn=$((warn+1)); }

# link <đích-trong-repo> <đường-dẫn-trong-~/.claude>
link() {
  local target="$1" linkpath="$2" name="${2##*/}"
  if [ -L "$linkpath" ]; then
    local cur; cur="$(readlink "$linkpath")"
    if [ "$cur" = "$target" ]; then good "$name — đã link đúng"; return; fi
    [ "$CHECK_ONLY" = 1 ] && { bad "$name — symlink trỏ chỗ khác: $cur"; return; }
    ln -sfn "$target" "$linkpath"; add "$name — trỏ lại vào repo (cũ: $cur)"; return
  fi
  if [ -e "$linkpath" ]; then
    [ "$CHECK_ONLY" = 1 ] && { bad "$name — đang là file/thư mục THẬT, sẽ được đổi tên .bak khi cài"; return; }
    local n=1; while [ -e "$linkpath.bak-$n" ]; do n=$((n+1)); done
    mv "$linkpath" "$linkpath.bak-$n"
    ln -s "$target" "$linkpath"
    bad "$name — bản cũ là thư mục thật, đã cất vào ${name}.bak-$n rồi mới link"
    return
  fi
  [ "$CHECK_ONLY" = 1 ] && { bad "$name — chưa cài"; return; }
  ln -s "$target" "$linkpath"; add "$name"
}

say "agent-auto → $REPO"
say "Claude Code → $CLAUDE_DIR"
[ "$CHECK_ONLY" = 1 ] && say "(chế độ --check: không thay đổi gì)"
say ""

# ── Skill ────────────────────────────────────────────────────────────────────
say "Skill (~/.claude/skills/)"
[ "$CHECK_ONLY" = 1 ] || mkdir -p "$CLAUDE_DIR/skills"
for d in "$REPO"/skills/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  link "${d%/}" "$CLAUDE_DIR/skills/$name"
done
say ""

# ── Hook guardrail ───────────────────────────────────────────────────────────
say "Hook guardrail (~/.claude/hooks/)"
[ "$CHECK_ONLY" = 1 ] || mkdir -p "$CLAUDE_DIR/hooks"
for f in "$REPO"/hooks/*.sh; do
  [ -f "$f" ] || continue
  link "$f" "$CLAUDE_DIR/hooks/$(basename "$f")"
done
say ""

# ── config.json + state.json: riêng từng người, không vào git ────────────────
say "Dữ liệu riêng từng người"
seed() { # seed <tên file> <ghi chú khi tạo mới>
  local f="$1" note="$2"
  if [ -f "$REPO/$f" ]; then good "$f — đã có (không đụng vào)"
  elif [ "$CHECK_ONLY" = 1 ]; then bad "$f — chưa có, cài xong sẽ tạo từ ${f%.json}.example.json"
  else cp "$REPO/${f%.json}.example.json" "$REPO/$f"; add "$f — tạo mới. $note"
  fi
}
seed config.json "PHẢI sửa: repos, cloudId, gitAuthor."
seed state.json  "Rỗng — /daily tự ghi tiếp."
say ""

# ── Nhắc phần phải tự làm tay ────────────────────────────────────────────────
# ── Phụ thuộc ngoài repo ─────────────────────────────────────────────────────
say "Phụ thuộc"
if command -v node >/dev/null; then good "node $(node -v)"
else bad "chưa có node — cần cho console, state-doctor, script SharePoint"; fi
if [ -d "$REPO/console/node_modules" ]; then
  good "console/node_modules — đã cài"
else
  # `npm start` = `npm run build && node server/index.js`, KHÔNG tự install. Thiếu bước này
  # thì console chết ngay lệnh đầu, mà thông báo của webpack không hề gợi ý nguyên nhân.
  bad "console/node_modules chưa có → console sẽ chết. Chạy: cd \"$REPO/console\" && npm install"
fi
say ""

# ── Hook trong settings.json ─────────────────────────────────────────────────
# Vì sao không mù quáng ghi đè: settings.json là file của NGƯỜI DÙNG, có thể đã có hook khác.
# Script tự phân loại 4 ca rồi chỉ ghi ở ca CHẮC CHẮN an toàn, và chỉ khi có --write-hooks.
say "Hook trong settings.json"
SETTINGS="$CLAUDE_DIR/settings.json"
# Lưu ý: `node -e` KHÔNG bọc code trong hàm module như khi chạy file, nên `return` ở top-level
# là SyntaxError — cả 4 ca sẽ cùng rơi về "badjson". Phải bọc IIFE. (Đã trả giá 14/8.)
hooks_state="$(node -e '
  (() => {
    const fs=require("fs"), p=process.argv[1], want=process.argv[2];
    if(!fs.existsSync(p)) return console.log("nofile");
    let j; try{ j=JSON.parse(fs.readFileSync(p,"utf8")||"{}"); }catch(e){ return console.log("badjson"); }
    const pre = j && j.hooks && j.hooks.PreToolUse;
    if(!pre || !pre.length) return console.log("nohooks");
    console.log(JSON.stringify(pre).includes(want) ? "ours" : "other");
  })();
' "$SETTINGS" "$CLAUDE_DIR/hooks/guard-bash.sh" 2>/dev/null || echo badjson)"

write_hooks_now() {
  node -e '
    const fs=require("fs"), p=process.argv[1], dir=process.argv[2];
    const j = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,"utf8")||"{}") : {};
    if (fs.existsSync(p)) fs.copyFileSync(p, p+".bak-before-agent-auto");
    j.hooks = j.hooks || {};
    j.hooks.PreToolUse = [
      { matcher:"Bash",       hooks:[{type:"command",command:"/bin/bash",args:[dir+"/hooks/guard-bash.sh"],timeout:5}] },
      { matcher:"Read|Grep",  hooks:[{type:"command",command:"/bin/bash",args:[dir+"/hooks/guard-read.sh"],timeout:5}] },
    ];
    j.hooks.PostToolUse = [
      { matcher:"Write|Edit|MultiEdit",      hooks:[{type:"command",command:"/bin/bash",args:[dir+"/hooks/guard-style.sh"],timeout:5}] },
      { matcher:"Write|Edit|MultiEdit|Bash", hooks:[{type:"command",command:"/bin/bash",args:[dir+"/hooks/guard-state.sh"],timeout:10}] },
    ];
    fs.mkdirSync(require("path").dirname(p),{recursive:true});
    fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
  ' "$SETTINGS" "$CLAUDE_DIR"
}

case "$hooks_state" in
  ours)  good "hook đã bật, trỏ đúng repo" ;;
  other) bad  "settings.json đã có PreToolUse của thứ khác — script KHÔNG đụng. Gộp tay khối dưới." ;;
  badjson) bad "settings.json không phải JSON hợp lệ — sửa tay trước đã, script không dám ghi đè." ;;
  nofile|nohooks)
    if [ "$CHECK_ONLY" = 1 ]; then bad "hook chưa bật (ghi được an toàn — chạy kèm --write-hooks)"
    elif [ "$WRITE_HOOKS" = 1 ]; then write_hooks_now; add "đã ghi hook vào settings.json (bản cũ giữ ở settings.json.bak-before-agent-auto)"
    else bad "hook chưa bật. Ghi hộ an toàn: bash tools/install-skills.sh --write-hooks"
    fi ;;
esac
if [ "$hooks_state" = other ] || [ "$hooks_state" = badjson ]; then
  cat <<JSON
    { "matcher": "Bash",
      "hooks": [{ "type": "command", "command": "/bin/bash",
                  "args": ["$CLAUDE_DIR/hooks/guard-bash.sh"], "timeout": 5 }] },
    { "matcher": "Read|Grep",
      "hooks": [{ "type": "command", "command": "/bin/bash",
                  "args": ["$CLAUDE_DIR/hooks/guard-read.sh"], "timeout": 5 }] }
JSON
  say "  … và trong PostToolUse:"
  cat <<JSON
    { "matcher": "Write|Edit|MultiEdit",
      "hooks": [{ "type": "command", "command": "/bin/bash",
                  "args": ["$CLAUDE_DIR/hooks/guard-style.sh"], "timeout": 5 }] },
    { "matcher": "Write|Edit|MultiEdit|Bash",
      "hooks": [{ "type": "command", "command": "/bin/bash",
                  "args": ["$CLAUDE_DIR/hooks/guard-state.sh"], "timeout": 10 }] }
JSON
fi
say ""

say "Còn phải làm tay:"
say "1) Sửa $REPO/config.json — 'repos' trỏ đúng máy bạn, 'cloudId' + 'gitAuthor' của bạn."
say "2) Kết nối Atlassian MCP trong Claude Code (gõ /mcp) — thiếu là /daily không quét được Jira."
say "3) Mở phiên Claude Code MỚI (skill nạp lúc khởi động), gõ /daily doctor để kiểm."
say "   Doctor phải ra 0 ERROR. Còn E10 nghĩa là config chưa sửa xong."
say ""
printf '%s\n' "Kết quả: $ok đã đúng · $changed thay đổi · $warn cần bạn xem"
[ "$warn" -gt 0 ] && exit 1 || exit 0
