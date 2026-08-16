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
#   - Nhận diện bằng awk state-machine, KHÔNG bằng grep một dòng. Đo thật 16/8/2026: bản grep đầu tiên
#     bị lách 5/5 ca (comment cuối dòng, block /* */ nhiều dòng, Edit nhỏ tỉ lệ cao, chèn từ whitelist).
#   - Whitelist 2 TẦNG. Tầng 1 tự thân đủ (pm__, eslint-disable, hack…). Tầng 2 là tên trình duyệt —
#     chỉ được tha khi dòng CÓ THÊM dấu hiệu vấn đề thật (số phiên bản, `<`/`>`, "không/bug/lỗi/fix").
#     Nếu không, `// Lấy nút cho edge` sẽ lách được chỉ nhờ chứa chữ "edge".
#   - Quyền phán cuối vẫn ở model: hook chỉ liệt kê file:line, không tự sửa, không chặn.
#
# exit 0 = im lặng · exit 2 = stderr được đưa về cho model đọc và tự gỡ.
# Self-test: bash ~/.claude/hooks/guard-style.test.sh

ABS_MAX=${GUARD_STYLE_MAX:-2}     # dư quá bao nhiêu dòng comment thì lên tiếng
PCT_MAX=${GUARD_STYLE_PCT:-20}    # hoặc: comment chiếm quá bao nhiêu % đoạn vừa ghi (khi có ≥2 dòng)
LONG_WORDS=${GUARD_STYLE_LONG:-8}  # comment từ ngần này từ trở lên = giải thích thật, không phải mô tả lại code

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

# --- Phân tích: tách comment, gom KHỐI comment liền nhau, rồi mới phán ---
# Vì sao gom khối: comment giải thích thường trải nhiều dòng, mỗi dòng lẻ thì ngắn.
# Đo thật 16/8/2026 trên jxm/2026-vo-lam-tinh-tu-subweb — chấm từng dòng thì
# "// lưới 1500, phân trang 2992, footer 3146." và "// không phải 70 như rect trong PSD)."
# đều bị bắt oan, dù chúng là dòng 2-3 của một lời giải thích số đo lấy từ PSD.

# --- Tầng 1: tự thân đủ để được tha (so ở dạng chữ thường) ---
# MJ__/MS__ là hook hành vi + style của libraryMainsite (cdn-source) — hợp đồng y như pm__,
# comment đánh dấu chúng là ĐƯỢC KHUYẾN KHÍCH. Thiếu 2 tiền tố này là bắt oan cả repo cdn-source.
T1='pm__|mj__|ms__|eslint-disable|stylelint-disable|prettier-ignore|@ts-|@license|copyright|sourcemappingurl|noqa|jshint|hack|workaround|polyfill|quirk|@param|@returns|@return|@typedef|@type |@example|psd'

# Dấu hiệu comment nêu LÝ DO / HỆ QUẢ — đúng ngoại lệ (b) của R-CS-1 dù không nhắc trình duyệt.
# Đo thật trên products/lan/2026-mainsite: thiếu tầng này thì bắt oan đúng loại comment giá trị nhất —
# "Đổi tên bundle = đổi URL trên CDN => người đã vào trang không bị kẹt".
WHY='=>|->|vì |bởi |nếu không|không thì|phải sửa|nhớ sửa|cẩn thận|lưu ý|chú ý|đừng |cấm |sẽ bị|sẽ mất|dẫn tới|dẫn đến|tránh |giữ nguyên|không được|chỉ dùng|do lib|do platform|theo design|theo yêu cầu|mốc release'
# --- Tầng 2: tên trình duyệt/nền tảng — chỉ tha khi kèm dấu hiệu vấn đề thật (T2CTX) ---
T2='safari|chrome|firefox|edge|webkit|moz-|ms-|ios|android|samsung|opera|ie[[:space:]]*[0-9]'
T2CTX='[0-9]|<|>|không|khong|bug|lỗi|loi|fix|fail|crash|sai|vỡ|vo[[:space:]]|render'

result=$(printf '%s\n' "$new" | awk -v t1="$T1" -v t2="$T2" -v t2ctx="$T2CTX" -v why="$WHY" -v LONG="$LONG_WORDS" '
  BEGIN { blk = 0; n = 0; bid = 0; prevc = 0; nonempty = 0 }
  {
    line = $0; is_c = 0
    if (blk) {
      is_c = 1
      if (line ~ /\*\// && blk == 1) blk = 0
      if (line ~ /-->/  && blk == 2) blk = 0
      if (line ~ /#\}/  && blk == 3) blk = 0
    }
    else if (line ~ /^[[:space:]]*\/\*/) { is_c = 1; if (line !~ /\*\//) blk = 1 }
    else if (line ~ /^[[:space:]]*<!--/) { is_c = 1; if (line !~ /-->/)  blk = 2 }
    else if (line ~ /^[[:space:]]*\{#/)  { is_c = 1; if (line !~ /#\}/)  blk = 3 }
    else if (line ~ /^[[:space:]]*\/\//) { is_c = 1 }
    # comment CUỐI DÒNG: phải có code rồi khoảng trắng rồi "//" — khoảng trắng bắt buộc là thứ
    # loại được "http://" (đứng ngay sau dấu hai chấm, không có khoảng trắng).
    else if (line ~ /[];,)}A-Za-z0-9_"][[:space:]]+\/\/[[:space:]]*[^\/[:space:]]/) { is_c = 1 }

    n++; L[n] = line; C[n] = is_c
    if (line ~ /[^[:space:]]/) nonempty++

    if (is_c) {
      if (!prevc) bid++
      B[n] = bid
      body = line
      sub(/^[[:space:]]*(\/\/+|\/\*+|\*+|<!--|\{#)[[:space:]]*/, "", body)
      # Cắt CẢ dấu đóng: "-->" chứa "->" nên để nguyên thì mọi comment HTML lọt qua tầng WHY.
      sub(/[[:space:]]*(-->|\*\/|#\})[[:space:]]*$/, "", body)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", body)
      BODY[n] = body
      if (body != "") { W[bid] += split(body, tmp, /[[:space:]]+/); LN[bid]++ }
    }
    prevc = is_c
  }
  END {
    for (i = 1; i <= n; i++) {
      if (!C[i]) continue
      body = BODY[i]
      if (body == "") continue          # dòng // rỗng = ngăn đoạn, không phải comment thừa
      low = tolower(body)
      if (low ~ t1) continue

      # CODE BỊ COMMENT OUT — rác, xoá hẳn. Độ dài KHÔNG cứu được nó.
      # "Kết thúc bằng ;" không đủ: "//  - BỎ 2 nút NHẬN THƯỞNG của bản H5 (trang chỉ xem);"
      # là câu tiếng Việt (đo thật trên xephang.scss). Phải thấy hình dạng code thật.
      dead = (body ~ /[{}]$/) \
          || (body ~ /^@(include|extend|media|import)/) \
          || (body ~ /^[.#&][a-zA-Z0-9_-]+/) \
          || (body ~ /^[a-z-]+:[[:space:]]*[^[:space:]].*;$/) \
          || (body ~ /=[^=]*;$/) \
          || (body ~ /[A-Za-z_$][A-Za-z0-9_$.]*\([^)]*\)[[:space:]]*;$/)

      if (!dead) {
        if (low ~ t2 && low ~ t2ctx) continue
        if (low ~ why) continue
        # ĐỘ DÀI CẢ KHỐI là dấu hiệu mạnh nhất, mạnh hơn mọi danh sách từ khoá.
        #   mô tả lại code    -> "Lấy nút", "Gán sự kiện", "UL"                        = 1-4 từ
        #   giải thích tại sao -> "18px: 18*1.3 + padding 8*2 = 39.4px, vừa khe 41px"  = 15 từ
        # Danh sách từ khoá không phủ hết cách người ta viết lý do bằng tiếng Việt; số từ thì phủ được.
        # Thà bỏ sót comment dài mà nhảm còn hơn bắt oan comment cứu người sau.
        # TRUNG BÌNH mỗi dòng, không phải tổng: 4 dòng "Lấy nút"/"Gán click" cộng lại
        # cũng vượt ngưỡng, trong khi mỗi dòng vẫn chỉ là mô tả lại code.
        if (LN[B[i]] > 0 && W[B[i]] / LN[B[i]] >= LONG) continue
      }
      print (dead ? "D\t" : "V\t") L[i]
    }
    print "#TOTAL\t" nonempty
  }
')

violations=$(printf '%s\n' "$result" | grep -v "^#TOTAL")

count=$(printf '%s' "$violations" | grep -c .)
total=$(printf '%s\n' "$result" | sed -n 's/^#TOTAL\t//p')
[ -z "$total" ] && total=0
[ "$total" -eq 0 ] && exit 0
pct=$(( count * 100 / total ))

# Báo khi: vượt ngưỡng tuyệt đối, HOẶC đoạn ngắn mà đặc comment (Edit nhỏ 4 dòng/2 comment = 50%).
if [ "$count" -le "$ABS_MAX" ] && ! { [ "$count" -ge 2 ] && [ "$pct" -gt "$PCT_MAX" ]; }; then
  exit 0
fi

# --- đổi số dòng trong đoạn ghi → số dòng thật trong file (nếu file còn đọc được) ---
# Cap 12 dòng: đo thật 16/8/2026 một ca in ra 31 dòng — ngập context mà không thêm thông tin,
# vì gỡ comment là việc làm cả lượt chứ không phải sửa từng dòng theo danh sách.
LIST_MAX=12
report=""; n=0
while IFS= read -r row; do
  [ -z "$row" ] && continue
  n=$((n+1))
  [ "$n" -gt "$LIST_MAX" ] && continue
  kind=${row%%$'\t'*}; text=${row#*$'\t'}
  [ "$kind" = "D" ] && tag="[code chết] " || tag=""
  trimmed=$(printf '%s' "$text" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  real=""
  [ -f "$file" ] && real=$(grep -nF -- "$trimmed" "$file" 2>/dev/null | head -1 | cut -d: -f1)
  if [ -n "$real" ]; then
    report="${report}  ${file}:${real}  ${tag}${trimmed}"$'\n'
  else
    report="${report}  ${file}  ${tag}${trimmed}"$'\n'
  fi
done <<< "$violations"
[ "$count" -gt "$LIST_MAX" ] && report="${report}  … còn $((count - LIST_MAX)) dòng nữa (soát cả file)"$'\n'

printf '%s\t%s\t%s\n' "$(date '+%F %T')" "R-CS-1 ($count/${total}=${pct}%)" "$file" >> "$HOME/.claude/hooks/guard.log" 2>/dev/null

{
  echo "[guard-style R-CS-1 MUST] Đoạn vừa ghi có $count dòng comment không thuộc 2 ngoại lệ hợp lệ"
  echo "($count/$total dòng = ${pct}%). Ngoại lệ: hợp đồng pm__/id/data-*, hack trình duyệt."
  echo "Luật: zero comment — xem ~/VNG/agent-auto/rules/code-style.md"
  echo ""
  printf '%s' "$report"
  echo ""
  echo "[code chết] = code bị comment out → XOÁ HẲN, git đã giữ lịch sử rồi."
  echo "Còn lại: gỡ đi. Dòng nào giải thích thứ code KHÔNG tự nói ra được thì giữ lại và"
  echo "nói rõ lý do trong báo cáo. Cần comment mới hiểu tên biến → đổi tên (R-CS-5), đừng giữ comment."
} >&2
exit 2
