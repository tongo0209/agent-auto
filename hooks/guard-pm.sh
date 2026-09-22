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
# Im lặng ở 3 ca (không nhiễu): file không có pm__ · pm-gate không nhận ra gameplay (kit mới phủ
# 2 gameplay, trang ngoài phạm vi không có gì để đối chiếu) · chưa cài node / chưa pull kit.
# Chỉ 🔴 mới lên tiếng; 🟡 là việc của người soát, không chặn luồng.
#
# exit 0 = im lặng · exit 2 = stderr được đưa về cho model đọc và tự sửa.
# Self-test: bash ~/.claude/hooks/guard-pm.test.sh

GATE=${PM_GATE:-$HOME/VNG/agent-auto/tools/pm-gate.mjs}

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
[ -z "$file" ] && exit 0

case "$file" in
  *.html|*.htm|*.twig) ;;
  *) exit 0 ;;
esac
case "$file" in
  */node_modules/*|*/vendor/*|*.min.*) exit 0 ;;
esac

[ -f "$file" ] || exit 0
[ -f "$GATE" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0
grep -q 'pm__' "$file" 2>/dev/null || exit 0

out=$(node "$GATE" "$file" 2>/dev/null)
[ $? -eq 1 ] || exit 0

printf '%s\t%s\t%s\n' "$(date '+%F %T')" "R-PM-8" "$file" >> "$HOME/.claude/hooks/guard.log" 2>/dev/null

{
  echo "[guard-pm R-PM-8 MUST] File landing vừa ghi vi phạm chuẩn ai-template-kit:"
  echo ""
  printf '%s\n' "$out" | grep '🔴'
  echo ""
  echo "Hook pm__/id/data-* là hợp đồng với JS platform — sai là nút chết trên production,"
  echo "giao diện vẫn đẹp nên QC nhìn không ra. Luật: ~/VNG/agent-auto/rules/pm-contract.md"
  echo "Chuẩn gốc: gt-promotion-template/standard-html-templates/ai-template-kit/AI-GUIDE.md"
  echo "Chạy lại sau khi sửa: node $GATE \"$file\""
} >&2
exit 2
