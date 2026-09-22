#!/bin/bash
# PostToolUse hook cho Write|Edit — chạy cổng pm-gate ngay sau khi ghi file landing có hook pm__ (R-PM-8).
#
# Vì sao cần: R-PM-7/8 nằm trong CLAUDE.md + rules, tức là văn xuôi — phiên dài thì trôi, subagent thì
# không được truyền. Hook thì không trôi. Bug hook pm__ không hiện ra ở giao diện: nút vẫn vẽ đẹp,
# chỉ chết khi JS platform bind — nên test UI và mắt người đều không bắt được, phải đếm.
#
# Vì sao PostToolUse: chặn trước thì file không được ghi, phải viết lại từ đầu. Ghi xong rồi báo
# "dòng 1025 nhân đôi pm__inform-text" chỉ tốn 1 Edit.
#
# Không nuốt gì của gate: 🔴 (exit 1) → chặn · 🟡 và lỗi dùng (exit 2, vd chưa pull kit) → cho qua
# nhưng đưa vào context model qua additionalContext (stderr ở exit 0 model KHÔNG thấy).
# Chưa khoá gameplay (PG-GAME): file mới → chặn; file đã có ở HEAD (landing cũ, D5) → nhắc khoá, cho qua.
# Im lặng khi: file không có pm__ · dist/node_modules/vendor/*.min.* · chưa cài node.
#
# exit 0 = cho qua · exit 2 = stderr được đưa về cho model đọc và tự sửa.
# Self-test: bash ~/.claude/hooks/guard-pm.test.sh

AGENT_AUTO=$(dirname "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")")
[ -f "$AGENT_AUTO/tools/pm-gate.mjs" ] || AGENT_AUTO="$HOME/VNG/agent-auto"
GATE="$AGENT_AUTO/tools/pm-gate.mjs"

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
[ -z "$file" ] && exit 0

case "$file" in
  *.html|*.htm|*.twig) ;;
  *) exit 0 ;;
esac
case "$file" in
  */node_modules/*|*/vendor/*|*/dist/*|*.min.*) exit 0 ;;
esac

[ -f "$file" ] || exit 0
[ -f "$GATE" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
grep -q 'pm__' "$file" 2>/dev/null || exit 0

tell_model() {
  jq -n --arg ctx "$1" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
  exit 0
}

out=$(node "$GATE" "$file" 2>&1)
rc=$?

if [ "$rc" -eq 2 ]; then
  tell_model "[guard-pm] pm-gate lỗi dùng — chưa soát được file này:
$out"
fi
if [ "$rc" -eq 0 ]; then
  printf '%s\n' "$out" | grep -q '🟡' && tell_model "[guard-pm R-PM-8] cảnh báo — soát tay, không chặn:
$out"
  exit 0
fi
if printf '%s\n' "$out" | grep -q 'PG-GAME.*chưa khoá gameplay' \
  && git -C "$(dirname "$file")" cat-file -e "HEAD:./$(basename "$file")" 2>/dev/null; then
  tell_model "[guard-pm R-PM-11] Landing cũ chưa khoá gameplay nên chưa soát được hợp đồng pm__.
Khoá trước khi sửa tiếp: node $AGENT_AUTO/tools/project-note.mjs init <thư mục campaign> rồi project-note.mjs lock <thư mục campaign> --gameplay <luckydraw-gift-exchange|payment|none> (xem $AGENT_AUTO/rules/pm-contract.md R-PM-11)."
fi

printf '%s\t%s\t%s\n' "$(date '+%F %T')" "R-PM-8" "$file" >> "${GUARD_LOG:-$HOME/.claude/hooks/guard.log}" 2>/dev/null
{
  echo "[guard-pm R-PM-8 MUST] File landing vừa ghi vi phạm hợp đồng ai-template-kit:"
  echo ""
  printf '%s\n' "$out"
  echo ""
  echo "Hook pm__/id/data-* là hợp đồng với JS platform — sai là nút chết trên production,"
  echo "giao diện vẫn đẹp nên QC nhìn không ra. Luật: $AGENT_AUTO/rules/pm-contract.md"
  echo "Chuẩn gốc: gt-promotion-template/standard-html-templates/ai-template-kit/AI-GUIDE.md"
  echo "Chạy lại sau khi sửa: node $GATE \"$file\""
} >&2
exit 2
