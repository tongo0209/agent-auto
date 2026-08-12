/**
 * Đọc/ghi mục của một section trong board — CHỖ DUY NHẤT biết một mục trải dài tới đâu.
 *
 * Vì sao phải có file này (đo thật trên board 2026-08-12): board viết mục tràn 2-3 dòng, và
 * cả hai đường cũ đều chỉ nhìn DÒNG ĐẦU vì cùng lọc `trim().startsWith('-')`:
 *   - `lib/board.js::section()` → 4/5 mục hiện trên UI đứt giữa câu
 *     (`…Cần bạn nói "[Tây Du VNG] Tam Tiêu`).
 *   - `routes/board.js` POST /board/check → tick xong thành
 *     `- [x] ~~…Tam Tiêu~~` + dòng `Nương Nương / Update hình" …` TREO lại ngoài mục.
 *   - `routes/board.js` POST /board/append → neo điểm chèn vào DÒNG BULLET cuối, nên bullet mới
 *     bị chèn vào GIỮA mục cuối; `parseNeedYou` coi phần đuôi là thân của bullet MỚI và
 *     `setChecked` gộp trọn khối về 1 dòng ⇒ **mất dữ liệu vĩnh viễn**. Tái hiện thật: board
 *     2026-08-03 (mục cuối 6 dòng tràn → file 134 còn 128 dòng), board 2026-08-12 (mục GW-477
 *     mất nửa câu, nửa đó sang tên cho mục mới).
 *
 * Một mục = dòng bullet + mọi dòng tiếp theo cho tới khi gặp bullet mới, DÒNG TRỐNG, hoặc
 * `## ` khác. Dòng trống kết thúc mục vì trong markdown nó đã kết đoạn — không phải chọn cho gọn.
 *
 * Mọi hàm ghi trong file này giữ NGUYÊN hình dạng file: kiểu xuống dòng (LF/CRLF) và thụt lề
 * của mục. Ghi lệch một trong hai thứ đó là làm bẩn diff của user trên chính file họ viết tay.
 */

const SECTION = 'Cần bạn';

/** Mở một bullet mới — dùng để biết mục trước đã hết, kể cả bullet không phải việc */
const isBullet = (line) => line.trim().startsWith('-');

/**
 * Mục "Cần bạn" là CHECKLIST: chỉ bullet có `[ ]`/`[x]` mới là việc.
 *
 * Ca thật board 2026-08-11: `## Cần bạn` là heading CUỐI file nên 30 dòng Log bị ghi lọt vào
 * trong section đó dưới dạng bullet trần (`- 11:36 — user cấp 2 nguồn giữa lượt…`); board 3/8
 * có 4 dòng như vậy. Đường đọc cũ lọc `startsWith('-')` nên nhận hết 34 dòng đó thành "việc
 * cần bạn" — chỉ chưa ai thấy vì console cũ chỉ đọc board HÔM NAY. Luật `- [ ]` này repo đã
 * dùng sẵn ở `lib/board.js::parseChecklist` cho `handoff.md`.
 */
const isChecklist = (line) => /^\s*-\s*\[[ xX]\]/.test(line);

const stripMarker = (line) => line.replace(/^\s*-\s*(\[[ xX]\]\s*)?/, '');

/**
 * Bóc marker + MỌI `~~` + gộp khoảng trắng.
 * Bóc `~~` toàn cục (không chỉ đầu/cuối) vì board thật có dạng
 * `- [x] ~~việc~~ → kết quả`: `~~` nằm giữa dòng nên luật đầu/cuối cũ để sót.
 */
const normalizeText = (s) =>
  stripMarker(String(s ?? ''))
    .replace(/~~/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * So `expectText` client gửi với text thật của mục (cổng chống race).
 *
 * Phải normalize CẢ HAI BÊN. Bản cũ so `normalizeText(expectText) !== item.text` — tức normalize
 * lần hai trên text đã normalize sẵn, nên với mục có nội dung bắt đầu bằng dấu gạch
 * (`- [ ] - việc gì`) thì `stripMarker` bóc thêm dấu gạch đó ⇒ không bao giờ khớp ⇒ mục ấy
 * VĨNH VIỄN không tick được (409 oan). Normalize hai bên thì phép so vẫn chặt mà không lệch.
 */
const matchesExpect = (expectText, itemText) => normalizeText(expectText) === normalizeText(itemText);

/** Kiểu xuống dòng của chính file — ghi lại phải dùng đúng kiểu đó */
const eolOf = (md) => (String(md ?? '').includes('\r\n') ? '\r\n' : '\n');
const splitLines = (md) => String(md ?? '').split(/\r?\n/);

function sectionRange(lines, name = SECTION) {
  const start = lines.findIndex((l) => l.trim() === '## ' + name);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++)
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  return { start, end };
}

/**
 * @param md nội dung board
 * @returns [{ index, done, text, startLine, endLine, indent }] — `index` đếm theo mục CHECKLIST
 *          trong section, `startLine`/`endLine` là chỉ số dòng 0-based trong `md`
 */
function parseNeedYou(md, section = SECTION) {
  const lines = splitLines(md);
  const range = sectionRange(lines, section);
  if (!range) return [];

  const items = [];
  for (let i = range.start + 1; i < range.end; i++) {
    if (!isBullet(lines[i])) continue;
    let endLine = i;
    for (let j = i + 1; j < range.end; j++) {
      if (isBullet(lines[j]) || lines[j].trim() === '') break;
      endLine = j;
    }
    if (isChecklist(lines[i]))
      items.push({
        index: items.length,
        done: /^\s*-\s*\[[xX]\]/.test(lines[i]),
        text: normalizeText(lines.slice(i, endLine + 1).join(' ')),
        startLine: i,
        endLine,
        indent: (lines[i].match(/^\s*/) || [''])[0],
      });
    i = endLine;
  }
  return items;
}

/**
 * Tick / bỏ tick mục thứ `index`, thay TRỌN khối `startLine..endLine` bằng đúng một dòng.
 *
 * Gộp về 1 dòng là quyết định có ý thức: `~~` bọc qua nhiều dòng tuỳ bộ render, còn quy ước
 * `- [x] ~~…~~` một dòng thì user đang gạch tay như vậy nên chắc chắn đúng. Mục đã tick không
 * cần giữ nếp gấp dòng. Nhưng THỤT LỀ thì giữ: `isChecklist` khớp cả bullet thụt lề, ghi lại ở
 * cột 0 sẽ đẩy mục con thành mục cấp 1 và phá cấu trúc lồng.
 *
 * @returns { md, text, line } | null (null = thiếu section hoặc index không tồn tại → KHÔNG ghi gì)
 */
function setChecked(md, index, done, section = SECTION) {
  const lines = splitLines(md);
  if (!sectionRange(lines, section)) return null;
  const item = parseNeedYou(md, section).find((i) => i.index === index);
  if (!item) return null;

  const line = item.indent + (done ? `- [x] ~~${item.text}~~` : `- [ ] ${item.text}`);
  lines.splice(item.startLine, item.endLine - item.startLine + 1, line);
  return { md: lines.join(eolOf(md)), text: item.text, line };
}

/**
 * Thêm một dòng vào cuối section, SAU TRỌN mục cuối.
 *
 * Điểm chèn = ngay sau DÒNG CÓ NỘI DUNG cuối cùng của section, không phải sau dòng bullet cuối.
 * Đây chính là chỗ bản cũ sai: dòng tràn của mục không phải bullet nên không được tính vào mục,
 * bullet mới chèn vào giữa mục cuối rồi `setChecked` gộp khối → mất dòng. Luật "sau dòng có nội
 * dung cuối" đúng cho cả `Cần bạn` (checklist nhiều dòng) và `Log` (log dài tràn dòng).
 *
 * Section chưa tồn tại thì TẠO ở cuối file — không được bỏ im lặng dòng user vừa gõ.
 *
 * @returns { md, insertedAt }
 */
function appendToSection(md, section, line) {
  const lines = splitLines(md);
  let range = sectionRange(lines, section);

  if (!range) {
    if (lines[lines.length - 1] !== '') lines.push('');
    lines.push('## ' + section, '');
    range = { start: lines.length - 2, end: lines.length };
  }

  let insertAt = range.start + 1;
  for (let i = range.start + 1; i < range.end; i++) if (lines[i].trim() !== '') insertAt = i + 1;
  // Section rỗng: giữ dòng trống phân cách ngay dưới heading, đừng dán sát heading
  if (insertAt === range.start + 1 && lines[insertAt] === '') insertAt += 1;

  lines.splice(insertAt, 0, line);
  return { md: lines.join(eolOf(md)), insertedAt: insertAt };
}

/**
 * Đổi mục thành chuỗi theo ĐÚNG hợp đồng mà UI đang dựa vào: mục đã tick được bọc `~~`
 * (`src/panels/todayPanel.js::renderNeed` dò `/^~~/` để biết done). Khác bản cũ ở chỗ duy nhất:
 * text giờ là TRỌN mục, không phải dòng đầu.
 */
const toBoardStrings = (items = []) => items.map((i) => (i.done ? `~~${i.text}~~` : i.text));

/**
 * Số bullet trần bị bỏ trong section "Cần bạn". Bỏ thì phải bỏ ỒN ÀO: `/api/debt` phơi số này
 * ra để board viết lệch section không biến mất trong im lặng.
 */
function countStrayBullets(md) {
  const lines = splitLines(md);
  const range = sectionRange(lines);
  if (!range) return 0;
  let n = 0;
  for (let i = range.start + 1; i < range.end; i++) if (isBullet(lines[i]) && !isChecklist(lines[i])) n++;
  return n;
}

module.exports = {
  parseNeedYou,
  setChecked,
  appendToSection,
  normalizeText,
  matchesExpect,
  toBoardStrings,
  countStrayBullets,
  SECTION,
};
