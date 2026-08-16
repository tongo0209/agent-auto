#!/bin/bash
# PostToolUse hook cho Write|Edit — bắt comment thừa NGAY sau khi ghi file (R-CS-1).
#
# Vì sao cần: luật zero-comment trong CLAUDE.md là văn xuôi, phiên dài thì trôi; hook thì không trôi.
# Vì sao PostToolUse chứ không PreToolUse: chặn trước sẽ hỏng luồng (file không được ghi, phải viết lại
# từ đầu). Ghi xong rồi báo "dòng 12, 30 là comment thừa" thì chỉ tốn 1 Edit gỡ — rẻ hơn nhiều.
#
# Thiết kế:
#   - Chỉ soi ĐOẠN VỪA GHI (tool_input.content / new_string), KHÔNG soi cả file. File .twig/.scss cũ
#     đầy comment của người khác — soi cả file là báo đỏ liên tục, dùng vài hôm là user tắt hook.
#   - Whitelist = 2 ngoại lệ hợp lệ của R-CS-1 (hợp đồng pm__, hack trình duyệt) + nhiễu công cụ
#     (eslint-disable, @ts-, license, sourceMappingURL). Whitelist rộng tay có chủ ý: thà bỏ sót
#     vài comment thừa còn hơn báo oan làm mất một dòng ghi chú thật sự cứu người sau.
#   - Quyền phán cuối vẫn ở model: hook chỉ liệt kê file:line, không tự sửa, không chặn.
#
# exit 0 = im lặng · exit 2 = stderr được đưa về cho model đọc và tự gỡ.
# Self-test: bash ~/.claude/hooks/guard-style.test.sh

THRESHOLD=${GUARD_STYLE_THRESHOLD:-2}   # dư quá bao nhiêu dòng comment thì mới lên tiếng

input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // ""' 2>/dev/null)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
[ -z "$file" ] && exit 0

# --- lọc theo loại file: chỉ code frontend, bỏ output build và file sinh tự động ---
case "$file" in
  *.js|*.mjs|*.cjs|*.ts|*.jsx|*.tsx|*.vue|*.scss|*.css|*.less|*.html|*.htm|*.twig) ;;
  *) exit 0 ;;
esac
case "$file" in
  */node_modules/*|*/dist/*|*/build/*|*/vendor/*|*.min.*|*webpack.config*|*/coverage/*) exit 0 ;;
esac

# --- lấy đúng phần vừa ghi ---
case "$tool" in
  Write)     new=$(printf '%s' "$input" | jq -r '.tool_input.content // ""' 2>/dev/null) ;;
  Edit)      new=$(printf '%s' "$input" | jq -r '.tool_input.new_string // ""' 2>/dev/null) ;;
  MultiEdit) new=$(printf '%s' "$input" | jq -r '[.tool_input.edits[]?.new_string] | join("\n")' 2>/dev/null) ;;
  *) exit 0 ;;
esac
[ -z "$new" ] && exit 0

# --- 2 ngoại lệ hợp lệ của R-CS-1 + nhiễu công cụ ---
WHITELIST='pm__|hack|workaround|fallback cho|safari|ios|android|chrome|firefox|edge|webkit|moz-|polyfill|quirk|eslint-disable|stylelint-disable|prettier-ignore|@ts-|@license|copyright|sourcemappingurl|jshint|@media|@font-face|noqa'

# --- gom dòng comment không thuộc whitelist ---
# Chỉ bắt comment ĐỨNG ĐẦU DÒNG. Comment cuối dòng code (`const a = 1; // ghi chú`) cố tình bỏ qua:
# regex phân biệt nó với `https://` hay chuỗi chứa "//" là không đáng tin, báo oan là mất uy tín hook.
violations=$(printf '%s\n' "$new" \
  | grep -nE '^[[:space:]]*(//|/\*|\*[^/]|\*$|<!--|\{#)' \
  | grep -viE "$WHITELIST" \
  | grep -vE '^[0-9]+:[[:space:]]*(/\*+|\*+/|\*)[[:space:]]*$')   # bỏ khung /** ... */ rỗng

count=$(printf '%s' "$violations" | grep -c . )
[ "$count" -le "$THRESHOLD" ] && exit 0

# --- đổi số dòng trong đoạn ghi → số dòng thật trong file (nếu file còn đọc được) ---
report=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  text=${line#*:}
  trimmed=$(printf '%s' "$text" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  real=""
  [ -f "$file" ] && real=$(grep -nF -- "$trimmed" "$file" 2>/dev/null | head -1 | cut -d: -f1)
  if [ -n "$real" ]; then
    report="${report}  ${file}:${real}  ${trimmed}"$'\n'
  else
    report="${report}  ${file}  ${trimmed}"$'\n'
  fi
done <<< "$violations"

printf '%s\t%s\t%s\n' "$(date '+%F %T')" "R-CS-1 ($count)" "$file" >> "$HOME/.claude/hooks/guard.log" 2>/dev/null

{
  echo "[guard-style R-CS-1 MUST] Đoạn vừa ghi có $count dòng comment không thuộc 2 ngoại lệ hợp lệ"
  echo "(hợp đồng pm__/id/data-*, hack trình duyệt). Luật: zero comment — xem ~/VNG/agent-auto/rules/code-style.md"
  echo ""
  printf '%s' "$report"
  echo ""
  echo "Gỡ các dòng trên. Nếu dòng nào giải thích thứ code KHÔNG tự nói ra được thì giữ lại và"
  echo "nói rõ lý do trong báo cáo. Cần comment mới hiểu tên biến → đổi tên (R-CS-5), đừng giữ comment."
} >&2
exit 2
