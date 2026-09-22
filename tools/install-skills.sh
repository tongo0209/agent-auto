#!/usr/bin/env bash
# Cài skill + hook của agent-auto vào Claude Code cho MỘT máy.
#
# Cách làm: symlink từ ~/.claude/ vào repo này — KHÔNG copy. Nhờ vậy `git pull` là
# skill mới có ngay, và sửa skill = sửa file trong repo (commit được).
#
#   bash tools/install-skills.sh            # cài
#   bash tools/install-skills.sh --check    # chỉ kiểm tra, không đụng gì
#   bash tools/install-skills.sh --relink   # cài + đổi symlink đang trỏ ra ngoài về repo này
#   bash tools/install-skills.sh --print-claude-md   # in luật chung để dán tay vào CLAUDE.md
#
# Script KHÔNG xoá gì. Symlink đang trỏ ra ngoài repo chỉ bị đổi khi có --relink, và danh sách
# symlink cũ được lưu vào .backups/relink-<ngày giờ>.txt trước khi đổi. settings.json chỉ được
# ghi khi bạn gọi --write-hooks: bổ sung đúng hook còn thiếu, không đụng hook khác. Gặp thư mục
# thật trùng tên thì cất vào .backups/replaced-<ngày giờ>/ rồi mới link, và in ra để bạn tự xử.
# Exit code: 0 = cài xong (kể cả khi còn việc tay); --check thì exit 1 khi còn mục cần xem.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CHECK_ONLY=0; WRITE_HOOKS=0; PRINT_CLAUDEMD=0; RELINK=0
for a in "$@"; do
  case "$a" in
    --check)           CHECK_ONLY=1 ;;
    --relink)          RELINK=1 ;;
    --write-hooks)     WRITE_HOOKS=1 ;;
    --print-claude-md) PRINT_CLAUDEMD=1 ;;
    *) echo "Tham số lạ: $a  (dùng: --check | --relink | --write-hooks | --print-claude-md)" >&2; exit 2 ;;
  esac
done
if [ "$CHECK_ONLY" = 1 ] && [ "$RELINK" = 1 ]; then
  echo "--check không đổi gì nên không đi cùng --relink — chạy riêng từng lệnh" >&2; exit 2
fi
STAMP="$(date +%Y%m%d-%H%M%S)"
RELINK_BACKUP="$REPO/.backups/relink-$STAMP.txt"
outside=()

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
    if [ "$RELINK" = 1 ]; then
      mkdir -p "${RELINK_BACKUP%/*}"
      printf '%s\t%s\n' "$linkpath" "$cur" >> "$RELINK_BACKUP"
      ln -sfn "$target" "$linkpath"; add "$name — trỏ lại vào repo (cũ: $cur)"; return
    fi
    outside+=("$name")
    bad "$name — symlink trỏ ra ngoài agent-auto: $cur"; return
  fi
  if [ -e "$linkpath" ]; then
    [ "$CHECK_ONLY" = 1 ] && { bad "$name — đang là file/thư mục THẬT, sẽ được cất vào .backups/ khi cài"; return; }
    # cất ra khỏi ~/.claude: để <tên>.bak cạnh đó thì Claude Code vẫn nạp nó thành skill trùng
    local replaced="$REPO/.backups/replaced-$STAMP"
    mkdir -p "$replaced"
    mv "$linkpath" "$replaced/$name"
    ln -s "$target" "$linkpath"
    bad "$name — bản cũ là thư mục thật, đã cất vào $replaced/$name rồi mới link"
    return
  fi
  [ "$CHECK_ONLY" = 1 ] && { bad "$name — chưa cài"; return; }
  ln -s "$target" "$linkpath"; add "$name"
}

# Dựng ~/.claude/CLAUDE.md từ templates/: điền đường dẫn repo, và chỉ in dòng rules nào
# có FILE THẬT — bản không mang rules nội bộ thì dòng đó tự biến mất thay vì trỏ vào hư không.
render_claude_md() {
  local repo_esc tbl
  repo_esc="${REPO//&/\\&}"
  tbl="$(mktemp)"
  {
    printf '| Chạm tới | Đọc TRƯỚC khi sửa |\n|---|---|\n'
    while IFS="$(printf '\t')" read -r file touchcol readcol; do
      case "$file" in ('' | '#'*) continue ;; esac
      [ -f "$REPO/$file" ] || continue
      printf '| %s | %s |\n' "$touchcol" "$readcol"
    done < "$REPO/templates/rules-index.tsv"
  } > "$tbl"
  # awk -v KHÔNG nhận biến nhiều dòng (awk của macOS báo "newline in string") — phải đọc từ file
  awk -v repo="$repo_esc" -v tblfile="$tbl" '
    { if ($0 == "<!-- RULES-TABLE -->") {
        while ((getline line < tblfile) > 0) print line
        close(tblfile); next }
      gsub(/<AGENT_AUTO>/, repo); print }
  ' "$REPO/templates/CLAUDE.md"
  # Luật riêng của nền tảng nội bộ — có file thì nối vào cuối, không có thì bỏ qua.
  [ -f "$REPO/templates/CLAUDE.internal.md" ] && { printf '\n'; cat "$REPO/templates/CLAUDE.internal.md"; }
  rm -f "$tbl"
}

if [ "$PRINT_CLAUDEMD" = 1 ]; then render_claude_md; exit 0; fi

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
# 3 dòng routing trong CLAUDE.md gọi skill của plugin superpowers — repo này không chứa chúng.
if ls "$CLAUDE_DIR"/plugins/cache/*/superpowers >/dev/null 2>&1; then
  good "plugin superpowers — đã cài"
else
  bad "chưa có plugin superpowers → 3 dòng routing trong CLAUDE.md (test-driven-development, verification-before-completion, systematic-debugging) trỏ vào skill không tồn tại. Cài: /plugin marketplace add obra/superpowers"
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

# ── Luật chung (~/.claude/CLAUDE.md) ────────────────────────────────────────
# Vì sao phải cài: skill là "làm thế nào", CLAUDE.md là "khi nào dùng cái nào" + luật ngôn ngữ,
# code style, git, verify. Thiếu nó thì cài đủ skill mà agent vẫn xử sự khác hẳn.
say "Luật chung (CLAUDE.md)"
CLAUDEMD="$CLAUDE_DIR/CLAUDE.md"
if [ ! -f "$CLAUDEMD" ]; then
  if [ "$CHECK_ONLY" = 1 ]; then bad "CLAUDE.md chưa có — cài xong sẽ tạo từ templates/CLAUDE.md"
  else mkdir -p "$CLAUDE_DIR"; render_claude_md > "$CLAUDEMD"; add "CLAUDE.md — tạo từ templates/CLAUDE.md"
  fi
elif grep -q "## Rules có mã" "$CLAUDEMD" && grep -qF "$REPO/rules" "$CLAUDEMD"; then
  good "CLAUDE.md — đã có luật chung, trỏ đúng repo"
else
  # KHÔNG đè: đây là file của người dùng, có thể đã có luật riêng.
  bad "CLAUDE.md đã có nhưng thiếu luật chung của agent-auto — xem phần cần dán:"
  say "      bash tools/install-skills.sh --print-claude-md"
fi
say ""

# ── Hook trong settings.json ─────────────────────────────────────────────────
# settings.json là file của người dùng, có thể đã có hook khác ⇒ chỉ nối hook còn thiếu
say "Hook trong settings.json"
SETTINGS="$CLAUDE_DIR/settings.json"
if ! command -v node >/dev/null; then
  bad "chưa có node — bỏ qua bước hook/statusline; cài node rồi chạy lại (kèm --write-hooks nếu muốn ghi hộ)"
else
hooks_mode=check; [ "$WRITE_HOOKS" = 1 ] && [ "$CHECK_ONLY" = 0 ] && hooks_mode=write
# `node -e` không bọc code trong hàm module: `return` top-level là SyntaxError ⇒ phải bọc IIFE (14/8)
hooks_report="$(node -e '
  (() => {
    const fs = require("fs"), [p, dir, repo, sh, mode] = process.argv.slice(1);
    const HOOKS = [
      ["guard-bash",  "PreToolUse",       "Bash",                      5],
      ["guard-read",  "PreToolUse",       "Read|Grep",                 5],
      ["guard-style", "PostToolUse",      "Write|Edit|MultiEdit",      5],
      ["guard-state", "PostToolUse",      "Write|Edit|MultiEdit|Bash", 10],
      ["guard-pm",    "PostToolUse",      "Write|Edit|MultiEdit",      10],
      ["token-watch", "UserPromptSubmit", "",                          5],
    ];
    let j = {};
    if (fs.existsSync(p)) {
      try { j = JSON.parse(fs.readFileSync(p, "utf8") || "{}"); } catch { return console.log("badjson"); }
    }
    j.hooks = j.hooks || {};
    const missing = HOOKS.filter(([name, event]) => !JSON.stringify(j.hooks[event] || []).includes(`/hooks/${name}.sh`));
    const writing = mode === "write" && (missing.length > 0 || !j.statusLine);
    if (writing) {
      // backup chỉ ghi 1 lần — chạy lần 2 mà đè thì bản gốc trước agent-auto mất luôn
      if (fs.existsSync(p) && !fs.existsSync(p + ".bak-before-agent-auto")) {
        fs.copyFileSync(p, p + ".bak-before-agent-auto");
        console.log("backup settings.json.bak-before-agent-auto");
      }
      for (const [name, event, matcher, timeout] of missing) {
        const hooks = [{ type: "command", command: sh, args: [`${dir}/hooks/${name}.sh`], timeout }];
        (j.hooks[event] = j.hooks[event] || []).push(matcher ? { matcher, hooks } : { hooks });
      }
      if (!j.statusLine) j.statusLine = { type: "command", command: `node ${repo}/tools/statusline.mjs` };
      fs.mkdirSync(require("path").dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
    }
    for (const [name] of HOOKS) console.log(!missing.some(([m]) => m === name) ? "ok" : writing ? "added" : "missing", name);
  })();
' "$SETTINGS" "$CLAUDE_DIR" "$REPO" "$(command -v bash)" "$hooks_mode" 2>/dev/null || echo failed)"

while read -r status name; do
  case "$status" in
    ok)      good "hook $name — đã bật" ;;
    added)   add  "hook $name — đã ghi bổ sung vào settings.json" ;;
    backup)  say  "    (bản gốc settings.json đã lưu: $name)" ;;
    missing) bad  "hook $name — chưa bật (ghi bổ sung, không đụng hook khác: --write-hooks)" ;;
    badjson) bad  "settings.json không phải JSON hợp lệ — sửa tay trước đã, script không dám ghi đè." ;;
    failed)  bad  "không đọc/ghi được $SETTINGS (node lỗi) — kiểm quyền file rồi chạy lại" ;;
  esac
done <<< "$hooks_report"
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
if [ -f "$CLAUDEMD" ] && grep -q "## Rules có mã" "$CLAUDEMD"; then
  say "3) Luật chung trong CLAUDE.md: đã có ✓"
else
  say "3) Dán luật chung vào ~/.claude/CLAUDE.md: bash tools/install-skills.sh --print-claude-md"
fi
say "4) Ghép Claude in Chrome: gõ /chrome → Enabled by default. Extension ghép theo ACCOUNT Claude"
say "   — 1 profile browser/1 account; Edge trên macOS chưa hiện trong danh sách."
say "5) Mở phiên Claude Code MỚI (skill nạp lúc khởi động), gõ /daily doctor — 0 ERROR mới là xong."
say ""
if [ "${#outside[@]}" -gt 0 ]; then
  say "Symlink trỏ ra ngoài agent-auto (${#outside[@]}): ${outside[*]} → đổi về repo: bash tools/install-skills.sh --relink"
fi
if [ -f "$RELINK_BACKUP" ]; then
  say "Symlink cũ đã lưu: $RELINK_BACKUP (mỗi dòng: <đường link><TAB><đích cũ>)"
fi
printf '%s\n' "Kết quả: $ok đã đúng · $changed thay đổi · $warn cần bạn xem"
if [ "$CHECK_ONLY" = 1 ] && [ "$warn" -gt 0 ]; then exit 1; fi
exit 0
