#!/usr/bin/env bash
# Cài skill + hook của agent-auto vào Claude Code cho MỘT máy.
#
# Cách làm: symlink từ ~/.claude/ vào repo này — KHÔNG copy. Nhờ vậy `git pull` là
# skill mới có ngay, và sửa skill = sửa file trong repo (commit được).
#
#   bash tools/install-skills.sh            # cài
#   bash tools/install-skills.sh --check    # chỉ kiểm tra, không đụng gì
#
# Script KHÔNG xoá gì. settings.json chỉ được ghi khi bạn gọi --write-hooks và chỉ ở ca
# an toàn (chưa có hook nào); ca khác in khối JSON để gộp tay. Gặp thư mục thật trùng tên
# thì đổi tên thành <tên>.bak-<n> rồi mới link, và in ra để bạn tự xử.
# Exit code: 0 = cài xong (kể cả khi còn việc tay); --check thì exit 1 khi còn mục cần xem.
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

# ── Agent definitions (~/.claude/agents/) — code-developer/bug-fixer cần chúng ─
say "Agent (~/.claude/agents/)"
[ "$CHECK_ONLY" = 1 ] || mkdir -p "$CLAUDE_DIR/agents"
for f in "$REPO"/agents/*.md; do
  [ -f "$f" ] || continue
  link "$f" "$CLAUDE_DIR/agents/$(basename "$f")"
done
[ -d "$REPO/agents/references" ] && link "$REPO/agents/references" "$CLAUDE_DIR/agents/references"
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
if command -v python3 >/dev/null && python3 -c 'import psd_tools' 2>/dev/null; then
  good "python3 + psd-tools"
else
  bad "thiếu python3/psd-tools — /check-design gãy ở bước dump PSD. Cài: pip3 install psd-tools"
fi
if [ -d "$REPO/console/node_modules" ]; then
  good "console/node_modules — đã cài"
else
  # `npm start` = `npm run build && node server/index.js`, KHÔNG tự install. Thiếu bước này
  # thì console chết ngay lệnh đầu, mà thông báo của webpack không hề gợi ý nguyên nhân.
  bad "console/node_modules chưa có → console sẽ chết. Chạy: cd \"$REPO/console\" && npm install"
  command -v xcode-select >/dev/null && ! xcode-select -p >/dev/null 2>&1 && \
    bad "  … và máy chưa có Xcode CLT (node-pty cần): xcode-select --install"
fi
say ""

# ── Liên kết ngoài repo: thiếu là gãy đúng 1 nhánh, kiểm hộ luôn ─────────────
say "Liên kết ngoài repo"
CLAUDEMD="$CLAUDE_DIR/CLAUDE.md"
if [ -f "$CLAUDEMD" ] && { grep -qF "$REPO/rules" "$CLAUDEMD" || grep -q "rules/pm-contract.md" "$CLAUDEMD"; }; then
  good "CLAUDE.md — đã trỏ rules/"
else
  bad "CLAUDE.md chưa trỏ $REPO/rules/ — agent sẽ không đọc luật R-* (khối dán sẵn in ở cuối)"
fi
if [ -e "$CLAUDE_DIR/skills/bug-fixer-lite" ]; then good "skill bug-fixer-lite — có"
elif grep -q '"autoFix": *true' "$REPO/config.json" 2>/dev/null; then
  bad "bugRadar.autoFix=true mà bug-fixer-lite chưa cài → radar sẽ gọi skill không tồn tại. Cài từ cdn-source/products/tontagent, hoặc đặt autoFix=false"
else
  say "  · bug-fixer-lite chưa cài — chỉ cần khi bật bugRadar.autoFix"
fi
say ""

# ── Hook trong settings.json ─────────────────────────────────────────────────
# Vì sao không mù quáng ghi đè: settings.json là file của NGƯỜI DÙNG, có thể đã có hook khác.
# Script tự phân loại 4 ca rồi chỉ ghi ở ca CHẮC CHẮN an toàn, và chỉ khi có --write-hooks.
say "Hook trong settings.json"
SETTINGS="$CLAUDE_DIR/settings.json"
if ! command -v node >/dev/null; then
  bad "chưa có node — bỏ qua bước hook/statusline; cài node rồi chạy lại (kèm --write-hooks nếu muốn ghi hộ)"
else
# Lưu ý: `node -e` KHÔNG bọc code trong hàm module như khi chạy file, nên `return` ở top-level
# là SyntaxError — cả 4 ca sẽ cùng rơi về "badjson". Phải bọc IIFE. (Đã trả giá 14/8.)
hooks_state="$(node -e '
  (() => {
    const fs=require("fs"), p=process.argv[1], want=process.argv[2];
    if(!fs.existsSync(p)) return console.log("nofile");
    let j; try{ j=JSON.parse(fs.readFileSync(p,"utf8")||"{}"); }catch(e){ return console.log("badjson"); }
    const pre = j && j.hooks && j.hooks.PreToolUse, post = j && j.hooks && j.hooks.PostToolUse;
    const hasPre = Array.isArray(pre) && pre.length, hasPost = Array.isArray(post) && post.length;
    if(!hasPre && !hasPost) return console.log("nohooks");
    // soi CẢ 2 mảng: chỉ soi Pre thì máy có PostToolUse của thứ khác sẽ bị ghi đè âm thầm
    console.log(JSON.stringify([pre||[],post||[]]).includes(want) ? "ours" : "other");
  })();
' "$SETTINGS" "$CLAUDE_DIR/hooks/guard-bash.sh" 2>/dev/null || echo badjson)"

write_hooks_now() {
  node -e '
    const fs=require("fs"), p=process.argv[1], dir=process.argv[2];
    const j = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,"utf8")||"{}") : {};
    // backup chỉ ghi 1 lần — chạy lần 2 mà đè thì bản gốc trước agent-auto mất luôn
    if (fs.existsSync(p) && !fs.existsSync(p+".bak-before-agent-auto")) fs.copyFileSync(p, p+".bak-before-agent-auto");
    j.hooks = j.hooks || {};
    j.hooks.PreToolUse = [
      { matcher:"Bash",       hooks:[{type:"command",command:"/bin/bash",args:[dir+"/hooks/guard-bash.sh"],timeout:5}] },
      { matcher:"Read|Grep",  hooks:[{type:"command",command:"/bin/bash",args:[dir+"/hooks/guard-read.sh"],timeout:5}] },
    ];
    j.hooks.PostToolUse = [
      { matcher:"Write|Edit|MultiEdit",      hooks:[{type:"command",command:"/bin/bash",args:[dir+"/hooks/guard-style.sh"],timeout:5}] },
      { matcher:"Write|Edit|MultiEdit|Bash", hooks:[{type:"command",command:"/bin/bash",args:[dir+"/hooks/guard-state.sh"],timeout:10}] },
    ];
    if (!j.statusLine) j.statusLine = { type:"command", command:"node "+process.argv[3]+"/tools/statusline.mjs" };
    fs.mkdirSync(require("path").dirname(p),{recursive:true});
    fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
  ' "$SETTINGS" "$CLAUDE_DIR" "$REPO"
}

case "$hooks_state" in
  ours)  good "hook đã bật, trỏ đúng repo" ;;
  other) bad  "settings.json đã có PreToolUse của thứ khác — script KHÔNG đụng. Gộp tay khối dưới." ;;
  badjson) bad "settings.json không phải JSON hợp lệ — sửa tay trước đã, script không dám ghi đè." ;;
  nofile|nohooks)
    if [ "$CHECK_ONLY" = 1 ]; then bad "hook chưa bật (ghi được an toàn — chạy kèm --write-hooks)"
    elif [ "$WRITE_HOOKS" = 1 ]; then write_hooks_now; add "đã ghi hook + statusline vào settings.json (bản cũ giữ ở settings.json.bak-before-agent-auto)"
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
if [ -f "$SETTINGS" ] && grep -q "statusline.mjs" "$SETTINGS"; then good "statusline — đã bật"
else bad "statusline chưa bật — --write-hooks ghi hộ, hoặc tự thêm key statusLine: node $REPO/tools/statusline.mjs"
fi
fi
say ""

say "Còn phải làm tay (đúng thứ tự — bước 2 cần MCP của bước 1):"
say "1) Kết nối MCP (gõ /mcp): Atlassian (bắt buộc — /daily quét Jira) · Google Drive (radar đọc"
say "   buglist sheet + design host Drive) · Microsoft 365 (dò SharePoint)."
say "2) Sửa $REPO/config.json — 3 chỗ: 'cloudId' (hỏi Claude: \"cho tôi cloudId Jira\" — cần MCP"
say "   bước 1), 'gitAuthor' (= git config user.email), 'repos' (đường dẫn tuyệt đối máy bạn)."
if [ -f "$CLAUDEMD" ] && { grep -qF "$REPO/rules" "$CLAUDEMD" || grep -q "rules/pm-contract.md" "$CLAUDEMD"; }; then
  say "3) CLAUDE.md → rules/: đã trỏ ✓"
else
  say "3) Dán khối sau vào cuối ~/.claude/CLAUDE.md (đường dẫn đã điền sẵn):"
  cat <<RULES

   ## Rules có mã (đọc theo nhu cầu — KHÔNG nạp sẵn; MUST = chặn, SHOULD = cảnh báo)
   | Chạm tới | Đọc TRƯỚC khi sửa |
   |---|---|
   | File có class \\`pm__\\` | $REPO/rules/pm-contract.md |
   | .twig trong new-mainsite | $REPO/rules/repo-new-mainsite.md |
   | .twig trong vportal2view | $REPO/rules/repo-vportal2view.md |
   | gt-promotion-template | $REPO/rules/repo-gt-promotion.md |
   | cdn-source (viết/sửa bất cứ gì) | $REPO/rules/cdn-source-standard.md |
   | Popup bất kỳ | $REPO/rules/popup-library.md |
   | Đưa HTML sang repo bàn giao | $REPO/rules/html-handoff.md |
   | Viết code bất kỳ | $REPO/rules/code-style.md |
RULES
fi
say "4) Ghép Claude in Chrome: gõ /chrome → Enabled by default. Extension ghép theo ACCOUNT Claude"
say "   — 1 profile browser/1 account; Edge trên macOS chưa hiện trong danh sách."
say "5) Mở phiên Claude Code MỚI (skill nạp lúc khởi động), gõ /daily doctor — 0 ERROR mới là xong."
say ""
printf '%s\n' "Kết quả: $ok đã đúng · $changed thay đổi · $warn cần bạn xem"
if [ "$CHECK_ONLY" = 1 ] && [ "$warn" -gt 0 ]; then exit 1; fi
exit 0
