import { test } from 'node:test';
import assert from 'node:assert';
import needyou from './needyou.js';

const { parseNeedYou, setChecked, normalizeText, toBoardStrings, countStrayBullets, appendToSection, matchesExpect } =
  needyou;

/**
 * Ca gốc (12/8): board thật viết mục "Cần bạn" tràn 2-3 dòng. Đường đọc cũ
 * (`lib/board.js` lọc `trim().startsWith('-')`) chỉ lấy DÒNG ĐẦU → 4/5 mục hiện
 * trên UI đứt giữa câu; đường ghi cũ (`routes/board.js`) tick xong để lại nửa câu
 * treo ngoài mục. Fixture dưới lấy nguyên văn từ boards/2026-08-12.md.
 */
const BOARD = [
  '# Board 2026-08-12',
  '',
  '## Log',
  '- 10:12 — delta lượt 1',
  '',
  '## Cần bạn',
  '- [ ] **GW-720 — việc gấp nhất hôm nay: due MAI 13/8.** Cần bạn nói "[Tây Du VNG] Tam Tiêu',
  '  Nương Nương / Update hình" là làm gì và có design chưa. Chưa có gì để tôi khởi động.',
  '- [ ] **GW-525 — cho phép sửa nhãn ngày sai** trong 12 file source + rebuild dist:',
  '  `12/8`→`11/8`, `2026-08-12`→`2026-08-11` (header Frame6/7/8/Share, `flying-lantern.js`,',
  '  `_i18n.js`, `waivers.md`). Lỗi của tôi; sửa mất 1 lệnh nhưng phải commit thêm nên cần bạn duyệt.',
  '- [x] ~~**GW-525 — duyệt push 6 commit**~~ → **đã push**, `origin/master` = `95d30206b`.',
  '',
].join('\n');

test('mục 2 dòng đọc ra TRỌN câu, không đứt giữa tên riêng', () => {
  const items = parseNeedYou(BOARD);
  assert.equal(items[0].text.includes('Tam Tiêu Nương Nương'), true, 'phải nối được tên bị tràn dòng');
  assert.equal(items[0].text.endsWith('Chưa có gì để tôi khởi động.'), true);
});

test('mục 3 dòng nối bằng ĐÚNG một khoảng trắng, không dính chữ', () => {
  const items = parseNeedYou(BOARD);
  assert.equal(items[1].text.includes('rebuild dist: `12/8`→`11/8`'), true);
  assert.equal(/\s{2,}/.test(items[1].text), false, 'không được còn khoảng trắng đôi');
});

test('startLine/endLine trỏ đúng khối của mục nhiều dòng', () => {
  const items = parseNeedYou(BOARD);
  assert.deepEqual(
    items.map((i) => [i.startLine, i.endLine]),
    [
      [6, 7],
      [8, 10],
      [11, 11],
    ]
  );
});

test('index đếm theo BULLET, giữ nguyên nghĩa index của /api/board/check cũ', () => {
  const items = parseNeedYou(BOARD);
  assert.deepEqual(
    items.map((i) => i.index),
    [0, 1, 2]
  );
});

test('mục đã tick: done=true và text sạch mọi `~~`, kể cả `~~` giữa dòng', () => {
  // `inner()` cũ chỉ bóc `~~` ở đầu/cuối nên dòng này còn sót `~~` giữa câu.
  const items = parseNeedYou(BOARD);
  assert.equal(items[2].done, true);
  assert.equal(items[2].text.includes('~~'), false);
  assert.equal(items[2].text.startsWith('**GW-525 — duyệt push 6 commit**'), true);
});

test('mục chưa tick thì done=false', () => {
  assert.deepEqual(
    parseNeedYou(BOARD).map((i) => i.done),
    [false, false, true]
  );
});

test('KHÔNG nuốt sang section sau', () => {
  const md = ['## Cần bạn', '- [ ] việc A', '  dòng tiếp của A', '', '## Log', '- 10:00 — không phải việc'].join('\n');
  const items = parseNeedYou(md);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'việc A dòng tiếp của A');
});

test('dòng trống cuối section không bị nhét vào text và không nới endLine', () => {
  const md = ['## Cần bạn', '- [ ] việc A', '', ''].join('\n');
  const items = parseNeedYou(md);
  assert.equal(items[0].text, 'việc A');
  assert.equal(items[0].endLine, 1);
});

test('mục là dòng CUỐI FILE, không có section sau', () => {
  const md = ['## Cần bạn', '- [ ] việc cuối', '  tràn dòng'].join('\n');
  assert.equal(parseNeedYou(md)[0].text, 'việc cuối tràn dòng');
});

test('board không có section "Cần bạn" → mảng rỗng, không nổ', () => {
  assert.deepEqual(parseNeedYou('# Board\n\n## Log\n- 10:00 — x'), []);
});

test('md rỗng/null → mảng rỗng', () => {
  assert.deepEqual(parseNeedYou(''), []);
  assert.deepEqual(parseNeedYou(null), []);
});

/* ─────────────────── setChecked ─────────────────── */

test('tick mục nhiều dòng: XOÁ cả khối cũ, không để nửa câu treo lại', () => {
  // Đây là bug đã tái hiện trên bản copy board 12/8: dòng 2 của mục bị bỏ lại ngoài mục.
  const out = setChecked(BOARD, 0, true);
  const lines = out.md.split('\n');
  assert.equal(lines[6], `- [x] ~~${parseNeedYou(BOARD)[0].text}~~`);
  assert.equal(lines[7].startsWith('- [ ] **GW-525'), true, 'dòng ngay sau phải là MỤC KẾ, không phải nửa câu cũ');
  assert.equal(out.md.includes('Nương Nương / Update hình" là làm gì'), true, 'nội dung không được mất');
});

test('tick xong parse lại vẫn đúng số mục và đúng trạng thái', () => {
  const items = parseNeedYou(setChecked(BOARD, 0, true).md);
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((i) => i.done),
    [true, false, true]
  );
});

test('bỏ tick trở về đúng một dòng `- [ ]`, không còn `~~`', () => {
  const out = setChecked(BOARD, 2, false);
  const line = out.md.split('\n')[11];
  assert.equal(line.startsWith('- [ ] '), true);
  assert.equal(line.includes('~~'), false);
});

test('tick rồi bỏ tick: nội dung mục không đổi', () => {
  const once = setChecked(BOARD, 0, true).md;
  const twice = setChecked(once, 0, false).md;
  assert.equal(parseNeedYou(twice)[0].text, parseNeedYou(BOARD)[0].text);
});

test('các section khác giữ NGUYÊN VĂN sau khi ghi', () => {
  const out = setChecked(BOARD, 1, true);
  assert.equal(out.md.includes('## Log\n- 10:12 — delta lượt 1'), true);
  assert.equal(out.md.startsWith('# Board 2026-08-12'), true);
});

test('index không tồn tại → null, không ghi bừa', () => {
  assert.equal(setChecked(BOARD, 9, true), null);
  assert.equal(setChecked(BOARD, -1, true), null);
});

test('board thiếu section → null', () => {
  assert.equal(setChecked('# Board\n\n## Log\n- 10:00 — x', 0, true), null);
});

test('trả về `text` của mục vừa ghi để route đối chiếu', () => {
  const out = setChecked(BOARD, 1, true);
  assert.equal(out.text, parseNeedYou(BOARD)[1].text);
});

/* ─────────────────── normalizeText (dùng cho expectText chống race) ─────────────────── */

test('normalizeText bóc được cả marker lẫn `~~` nếu client gửi kèm', () => {
  // Client có thể gửi lại nguyên dòng thay vì text đã sạch — chống race không được vì thế mà 409 oan.
  assert.equal(normalizeText('- [x] ~~việc A~~'), 'việc A');
  assert.equal(normalizeText('việc A'), 'việc A');
});

test('normalizeText gộp khoảng trắng nên text nhiều dòng của client vẫn khớp', () => {
  assert.equal(normalizeText('việc A\n   dòng tiếp'), 'việc A dòng tiếp');
});

/* ─────────── toBoardStrings: giữ hợp đồng chuỗi mà UI đang dựa vào ─────────── */

test('toBoardStrings bọc `~~` cho mục đã tick — UI nhận diện done bằng tiền tố này', () => {
  // src/panels/todayPanel.js::renderNeed dò `/^~~/`. Đổi hợp đồng là mất dấu tick trên UI.
  const out = toBoardStrings(parseNeedYou(BOARD));
  assert.equal(/^~~/.test(out[0]), false);
  assert.equal(/^~~/.test(out[2]), true);
  assert.equal(out[2].endsWith('~~'), true);
});

test('toBoardStrings trả TRỌN câu của mục nhiều dòng (đây là chỗ vá lỗi cắt câu)', () => {
  const out = toBoardStrings(parseNeedYou(BOARD));
  assert.equal(out[0].includes('Tam Tiêu Nương Nương'), true);
  assert.equal(out[0].endsWith('Chưa có gì để tôi khởi động.'), true);
});

test('toBoardStrings giữ đúng số phần tử để `index` của client không lệch', () => {
  assert.equal(toBoardStrings(parseNeedYou(BOARD)).length, 3);
  assert.deepEqual(toBoardStrings([]), []);
});

/* ─────────── bullet KHÔNG có checkbox = dòng log lọt vào, không phải việc ─────────── */

/**
 * Ca thật board 2026-08-11: `## Cần bạn` là heading CUỐI file (dòng 97) và 30 dòng Log bị ghi
 * lọt vào trong section đó dưới dạng bullet trần `- 11:36 — user cấp 2 nguồn…`. Board 3/8 có 4
 * dòng như vậy. Mục "Cần bạn" là CHECKLIST — repo đã dùng đúng luật này ở
 * `lib/board.js::parseChecklist` (`/^- \[[ x]\] /`) cho `handoff.md`.
 */
const MIXED = [
  '## Cần bạn',
  '- [ ] **GW-477 — CÒN LẠI: báo BE 4 trang con không còn.**',
  '  `ranking.html` · `shop.html` đã bị xoá.',
  '- 11:36 — user cấp 2 nguồn giữa lượt: gameplay design',
  '- 12:20 — `git pull --ff-only` gt-promotion: Already up to date',
  '- [ ] **GW-720 — cần bạn quyết**',
].join('\n');

test('bullet trần (không checkbox) KHÔNG thành mục việc', () => {
  const items = parseNeedYou(MIXED);
  assert.equal(items.length, 2);
  assert.equal(items[0].text.startsWith('**GW-477'), true);
  assert.equal(items[1].text, '**GW-720 — cần bạn quyết**');
});

test('index đếm theo mục CHECKLIST, nên tick không bắn vào dòng log', () => {
  const out = setChecked(MIXED, 1, true);
  const lines = out.md.split('\n');
  assert.equal(lines[5], '- [x] ~~**GW-720 — cần bạn quyết**~~');
  assert.equal(lines[3], '- 11:36 — user cấp 2 nguồn giữa lượt: gameplay design', 'dòng log phải y nguyên');
});

test('bullet trần KHÔNG được nuốt vào mục checklist đứng trước nó', () => {
  assert.equal(parseNeedYou(MIXED)[0].text.includes('11:36'), false);
});

test('countStrayBullets đếm ra dòng lạ — bỏ thì phải bỏ ỒN ÀO, không im lặng', () => {
  assert.equal(countStrayBullets(MIXED), 2);
  assert.equal(countStrayBullets(BOARD), 0);
  assert.equal(countStrayBullets('# Board\n\n## Log\n- 10:00 — x'), 0);
});

/* ═══════════ appendToSection — ca CRITICAL do review đối kháng bắt được ═══════════ */

/**
 * Bản cũ (`routes/board.js`) neo điểm chèn vào DÒNG BULLET cuối:
 *   for (i…) if (lines[i].trim().startsWith('-')) insertAt = i + 1;
 * Dòng tràn của mục (thụt 2 space) không phải bullet nên KHÔNG được tính vào mục ⇒ bullet mới
 * bị chèn vào GIỮA mục cuối. Sau đó `parseNeedYou` coi phần đuôi đó là thân của bullet MỚI, và
 * `setChecked` gộp trọn khối về 1 dòng ⇒ các dòng gốc mất vĩnh viễn.
 * Tái hiện thật trên board 2026-08-03 (mục cuối 6 dòng tràn → file 134 còn 128 dòng) và trên
 * board 2026-08-12 (mục GW-477 2 dòng → nửa câu sang tên cho mục mới).
 */
const MULTI = [
  '# Board X',
  '',
  '## Log',
  '- 10:00 — log cũ',
  '',
  '## Cần bạn',
  '- [ ] **GW-477 — báo BE 4 trang con không còn**: `event.html` · `myaccount.html` ·',
  '  `ranking.html` · `shop.html` đã bị xoá khỏi `A49-CFL/offlinetournament-52017/mainsite/`.',
  '',
].join('\n');

test('CRITICAL: chèn mục mới phải nằm SAU TRỌN mục cuối, không cắt đôi nó', () => {
  const out = appendToSection(MULTI, 'Cần bạn', '- [ ] GW-999: việc mới');
  const lines = out.md.split('\n');
  assert.equal(lines[6].startsWith('- [ ] **GW-477'), true);
  assert.equal(lines[7].trim().startsWith('`ranking.html`'), true, 'dòng tràn phải còn thuộc mục GW-477');
  assert.equal(lines[8], '- [ ] GW-999: việc mới', 'mục mới phải đứng SAU dòng tràn');
});

test('CRITICAL: sau khi chèn, mục cũ vẫn đọc ra TRỌN câu và mục mới không ăn đuôi mục cũ', () => {
  const items = parseNeedYou(appendToSection(MULTI, 'Cần bạn', '- [ ] GW-999: việc mới').md);
  assert.equal(items.length, 2);
  assert.equal(items[0].text.endsWith('offlinetournament-52017/mainsite/`.'), true);
  assert.equal(items[1].text, 'GW-999: việc mới');
});

test('CRITICAL: chèn rồi tick mục mới KHÔNG làm mất dòng nào của mục cũ', () => {
  const appended = appendToSection(MULTI, 'Cần bạn', '- [ ] GW-999: việc mới').md;
  const after = setChecked(appended, 1, true).md;
  assert.equal(after.includes('`ranking.html` · `shop.html` đã bị xoá'), true, 'nội dung mục cũ không được mất');
  assert.equal(parseNeedYou(after)[0].text.endsWith('mainsite/`.'), true);
});

test('section rỗng (chỉ heading) → chèn sau dòng trống, không dán sát heading', () => {
  const out = appendToSection('## Cần bạn\n\n', 'Cần bạn', '- [ ] việc đầu tiên');
  assert.deepEqual(out.md.split('\n').slice(0, 3), ['## Cần bạn', '', '- [ ] việc đầu tiên']);
});

test('section chưa có → tạo ở cuối file, không bỏ im lặng dòng của user', () => {
  const out = appendToSection('# Board\n\n## Log\n- 10:00 — x\n', 'Cần bạn', '- [ ] việc mới');
  assert.equal(out.md.includes('## Cần bạn'), true);
  assert.equal(out.md.trimEnd().endsWith('- [ ] việc mới'), true);
});

test('chèn vào Log không đụng section Cần bạn', () => {
  const out = appendToSection(MULTI, 'Log', '- 11:00 — log mới');
  const lines = out.md.split('\n');
  assert.equal(lines[4], '- 11:00 — log mới');
  assert.equal(out.md.includes('`ranking.html` · `shop.html`'), true);
});

test('Log nhiều dòng cũng không bị cắt đôi', () => {
  const md = ['## Log', '- 10:00 — dòng đầu của log dài', '  phần tràn của log', '', '## Cần bạn', '- [ ] x'].join('\n');
  const lines = appendToSection(md, 'Log', '- 11:00 — mới').md.split('\n');
  assert.equal(lines[2].trim(), 'phần tràn của log');
  assert.equal(lines[3], '- 11:00 — mới');
});

/* ═══════════ giữ nguyên hình dạng file: thụt lề & CRLF ═══════════ */

test('mục thụt lề giữ ĐÚNG thụt lề sau khi tick (checklist lồng không nhảy cấp)', () => {
  const md = ['## Cần bạn', '- [ ] mục cha', '  - [ ] mục con thụt 2 space'].join('\n');
  const items = parseNeedYou(md);
  const out = setChecked(md, items.length - 1, true);
  const last = out.md.split('\n').pop();
  assert.equal(last.startsWith('  - [x] '), true, `phải giữ 2 space, nhận được: ${JSON.stringify(last)}`);
});

test('board CRLF: dòng ghi ra dùng CRLF, không làm file lẫn EOL', () => {
  const md = ['## Cần bạn', '- [ ] việc A', ''].join('\r\n');
  const out = setChecked(md, 0, true);
  assert.equal(out.md.includes('\r\n- [x] '), true, 'dòng mới phải mang CRLF');
  assert.equal(/[^\r]\n/.test(out.md), false, 'không được còn dòng LF trơ trọi');
});

test('board CRLF: text đọc ra không dính ký tự \\r', () => {
  const md = ['## Cần bạn', '- [ ] việc A', '  dòng tiếp'].join('\r\n');
  assert.equal(parseNeedYou(md)[0].text, 'việc A dòng tiếp');
});

test('appendToSection giữ CRLF của board', () => {
  const md = ['## Cần bạn', '', '- [ ] việc A', ''].join('\r\n');
  const out = appendToSection(md, 'Cần bạn', '- [ ] việc B');
  assert.equal(out.md.includes('\r\n- [ ] việc B'), true);
  assert.equal(/[^\r]\n/.test(out.md), false);
});

/* ═══════════ matchesExpect — chống 409 oan ═══════════ */

test('matchesExpect: mục có nội dung BẮT ĐẦU bằng dấu gạch vẫn khớp (không 409 oan)', () => {
  // Bản cũ so `normalizeText(expectText) !== item.text` — normalize LẦN HAI bóc thêm dấu `- `
  // ở đầu nội dung nên không bao giờ khớp ⇒ mục đó vĩnh viễn không tick được.
  const md = ['## Cần bạn', '- [ ] - việc bắt đầu bằng gạch'].join('\n');
  const item = parseNeedYou(md)[0];
  assert.equal(matchesExpect(item.text, item.text), true);
});

test('matchesExpect: client gửi kèm marker/`~~` vẫn khớp', () => {
  assert.equal(matchesExpect('- [x] ~~việc A~~', 'việc A'), true);
  assert.equal(matchesExpect('việc A', 'việc A'), true);
});

test('matchesExpect: text KHÁC thật thì vẫn phải trả false (không nới lỏng cổng race)', () => {
  assert.equal(matchesExpect('việc B', 'việc A'), false);
});
