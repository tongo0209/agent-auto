#!/bin/bash
# Self-test cho install-skills.sh: repo giả + HOME giả trong tmp — KHÔNG đụng ~/.claude hay repo thật.
# Chạy: bash tools/install-skills.test.sh   (exit 0 = pass hết)
set -uo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)/install-skills.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

REPO="$TMP/repo"; FAKE_HOME="$TMP/home"; CD="$FAKE_HOME/.claude"; OLD="$TMP/nguon-cu"
SETTINGS="$CD/settings.json"
mkdir -p "$REPO/tools" "$REPO/skills/alpha" "$REPO/skills/beta" "$REPO/agents/references" \
         "$REPO/hooks" "$REPO/templates" "$OLD/alpha" "$CD/skills" "$CD/agents"
cp "$SRC" "$REPO/tools/"
for h in guard-bash guard-read guard-state guard-style guard-pm token-watch; do : > "$REPO/hooks/$h.sh"; done
: > "$REPO/agents/lane.md"; : > "$OLD/lane.md"
echo '{}' > "$REPO/config.example.json"; echo '{}' > "$REPO/state.example.json"
printf '<!-- RULES-TABLE -->\n' > "$REPO/templates/CLAUDE.md"; : > "$REPO/templates/rules-index.tsv"
ln -s "$OLD/alpha" "$CD/skills/alpha"
ln -s "$OLD/lane.md" "$CD/agents/lane.md"
mkdir -p "$REPO/skills/gamma" "$CD/skills/gamma"; echo "ban-that" > "$CD/skills/gamma/SKILL.md"

OUT=""; RC=0
run() { OUT="$(env -u CLAUDE_CONFIG_DIR HOME="$FAKE_HOME" bash "$REPO/tools/install-skills.sh" "$@" 2>&1)"; RC=$?; }
has() { printf '%s' "$OUT" | grep -qF -- "$1"; }
lacks() { ! has "$1"; }
expect() { # <tên ca> <lệnh kiểm...>
  local name="$1"; shift
  if "$@"; then pass=$((pass+1)); echo "  ✓ $name"
  else fail=$((fail+1)); echo "  ✗ $name"; fi
}
points_to() { [ "$(readlink "$1")" = "$2" ]; }
hook_count() { grep -c "hooks/$1.sh" "$SETTINGS"; }

echo "install-skills.sh"

run --check
expect "--check nêu tên skill trỏ ra ngoài + đích cũ" has "alpha — symlink trỏ ra ngoài agent-auto: $OLD/alpha"
expect "--check nêu tên agent trỏ ra ngoài" has "lane.md — symlink trỏ ra ngoài agent-auto: $OLD/lane.md"
expect "--check in dòng tổng hợp + cách sửa" has "Symlink trỏ ra ngoài agent-auto (2): alpha lane.md"
expect "--check không đổi symlink" points_to "$CD/skills/alpha" "$OLD/alpha"
expect "--check còn việc ⇒ exit 1" [ "$RC" = 1 ]

run --check --relink
expect "--check đi cùng --relink ⇒ từ chối, exit 2" [ "$RC" = 2 ]

run
expect "cài thường KHÔNG tự đổi symlink trỏ ra ngoài" points_to "$CD/skills/alpha" "$OLD/alpha"
expect "cài thường vẫn cài skill chưa có" points_to "$CD/skills/beta" "$REPO/skills/beta"
expect "cài thường cài agents/references" points_to "$CD/agents/references" "$REPO/agents/references"
expect "thư mục thật trùng tên ⇒ được link" points_to "$CD/skills/gamma" "$REPO/skills/gamma"
expect "bản thật KHÔNG nằm lại trong skills/ (Claude Code sẽ nạp như skill trùng)" [ -z "$(ls -d "$CD"/skills/gamma.* 2>/dev/null)" ]
expect "bản thật được cất vào .backups/replaced-<ts>/" grep -qx "ban-that" "$(ls -d "$REPO"/.backups/replaced-*/gamma 2>/dev/null | head -1)/SKILL.md"

run --relink
expect "--relink đổi skill về repo" points_to "$CD/skills/alpha" "$REPO/skills/alpha"
expect "--relink đổi agent về repo" points_to "$CD/agents/lane.md" "$REPO/agents/lane.md"
backup="$(ls "$REPO"/.backups/relink-*.txt 2>/dev/null | head -1)"
expect "--relink ghi backup .backups/relink-<ts>.txt" [ -n "$backup" ]
expect "backup giữ symlink cũ (đường link + đích cũ)" grep -qF "$(printf '%s\t%s' "$CD/skills/alpha" "$OLD/alpha")" "$backup"
expect "--relink in chỗ để backup" has "Symlink cũ đã lưu: $backup"

run --check
expect "--check sau --relink: hết trỏ ra ngoài" lacks "trỏ ra ngoài agent-auto"

printf '%s\n' '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"/x/khac.sh"}]},{"matcher":"Bash","hooks":[{"type":"command","command":"bash","args":["'"$CD"'/hooks/guard-bash.sh"]}]}]}}' > "$SETTINGS"
run --check
expect "--check nhận hook đã có theo từng script" has "hook guard-bash — đã bật"
expect "--check nêu từng hook còn thiếu" has "hook guard-pm — chưa bật"
expect "--check nêu token-watch còn thiếu" has "hook token-watch — chưa bật"

run --write-hooks
expect "--write-hooks bổ sung guard-pm" [ "$(hook_count guard-pm)" = 1 ]
expect "--write-hooks bổ sung token-watch vào UserPromptSubmit" \
  node -e 'const j=require(process.argv[1]); process.exit(JSON.stringify(j.hooks.UserPromptSubmit||[]).includes("token-watch.sh")?0:1)' "$SETTINGS"
expect "--write-hooks không nhân đôi hook đã có" [ "$(hook_count guard-bash)" = 1 ]
expect "--write-hooks giữ hook của thứ khác" grep -qF "/x/khac.sh" "$SETTINGS"
expect "--write-hooks lưu bản gốc 1 lần" [ -f "$SETTINGS.bak-before-agent-auto" ]
before="$(cat "$SETTINGS")"
run --write-hooks
expect "--write-hooks chạy lần 2 không đổi gì" [ "$before" = "$(cat "$SETTINGS")" ]

echo '{}' > "$SETTINGS"; chmod 444 "$SETTINGS"
run --write-hooks
chmod 644 "$SETTINGS"
expect "ghi settings.json thất bại ⇒ không báo đã ghi" lacks "đã ghi bổ sung"
expect "ghi settings.json thất bại ⇒ báo rõ" has "không đọc/ghi được"

printf '{hỏng' > "$SETTINGS"
run --write-hooks
expect "settings.json hỏng ⇒ không ghi đè" [ "$(cat "$SETTINGS")" = '{hỏng' ]
expect "settings.json hỏng ⇒ báo rõ" has "không phải JSON hợp lệ"

printf '%d pass · %d fail\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
