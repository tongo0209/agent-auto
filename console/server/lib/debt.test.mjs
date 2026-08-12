import { test } from 'node:test';
import assert from 'node:assert';
import debt from './debt.js';

const { ownerKey, buildDebt } = debt;

/**
 * Ca gốc (12/8): board là sổ theo NGÀY, console chỉ đọc board hôm nay ⇒ mục "Cần bạn" chưa tick
 * ở board cũ không ai gom lại. Đo thật: board 12/8 mang 4 mục mở, các board cũ còn 62 mục.
 * Rơi thật: 4 việc GW-627 ở board 10/8 (báo designer 3 lỗi design · lỗi bản TH · xác nhận CDN
 * sync · thứ tự release) chỉ tồn tại ở board 10/8, chưa tick, không xuất hiện lại ở 11/8 hay
 * 12/8 — mất radar 2 ngày, mà GW-627 release 15/8.
 *
 * Luật chốt: THEO TICKET. Mục mở ở board cũ mà owner key VẮNG trên board hôm nay ⇒ rơi radar.
 * Không khớp mờ nội dung: cùng một việc mỗi ngày diễn đạt một kiểu (GW-720 có 3 bản khác nhau),
 * khớp mờ vừa không gộp được vừa gộp oan 2 việc khác nhau cùng ticket.
 */

const it = (text, done = false) => ({ text, done });
const STATE = {
  issues: {
    'GW-627': { phase: 'done-fe' },
    'GW-720': { phase: 'waiting-design' },
    'GW-660': { phase: 'closed' },
    'GW-654': { phase: 'reassigned' },
  },
};
/** Gắn `index` theo vị trí — y như lib/needyou.js::parseNeedYou trả về, để fixture khớp thực tế */
const call = (boards, today = '2026-08-12', state = STATE) =>
  buildDebt({
    boards: boards.map((b) => ({ ...b, items: (b.items || []).map((x, i) => ({ ...x, index: i })) })),
    today,
    state,
  });

/* ─────────────────── ownerKey ─────────────────── */

test('ownerKey lấy key GW ĐẦU TIÊN — đúng cách skill mở đầu mục', () => {
  assert.equal(ownerKey('GW-477: bản giao 13:40 skill chưa verify'), 'GW-477');
  assert.equal(ownerKey('**GW-720 — việc gấp nhất hôm nay: due MAI 13/8.**'), 'GW-720');
});

test('ownerKey bỏ qua chữ dẫn trước key — ca thật "(còn từ 6/8) GW-660: …"', () => {
  assert.equal(ownerKey('(còn từ 6/8) GW-660: lệch bản pm__ cần anh quyết'), 'GW-660');
});

test('key thứ hai trong mục KHÔNG đổi chủ', () => {
  assert.equal(ownerKey('GW-627: chờ GW-610 xong mới release'), 'GW-627');
});

test('mục không nhắc ticket nào → null', () => {
  assert.equal(ownerKey('dọn lại thư mục designs cho gọn'), null);
});

/* ─────────────────── luật theo-ticket ─────────────────── */

test('ticket VẮNG trên board hôm nay ⇒ mục cũ rơi radar — ca thật GW-627', () => {
  const out = call([
    { date: '2026-08-10', items: [it('GW-627: báo designer 3 lỗi trong file design')] },
    { date: '2026-08-12', items: [it('GW-720: cần bạn nói là việc gì')] },
  ]);
  assert.deepEqual(
    out.groups.map((g) => g.key),
    ['GW-627']
  );
  assert.equal(out.groups[0].items[0].staleDays, 2);
});

test('ticket CÒN trên board hôm nay ⇒ mục cũ không báo, dù diễn đạt hoàn toàn khác', () => {
  // 3 bản GW-720 trùng token rất thấp; luật theo-ticket không cần khớp chữ nên vẫn đúng.
  const out = call([
    { date: '2026-08-10', items: [it('GW-720: làm rõ ticket — "Update hình" của cái gì, ở đâu?')] },
    { date: '2026-08-12', items: [it('**GW-720 — việc gấp nhất hôm nay: due MAI 13/8.**')] },
  ]);
  assert.deepEqual(out.groups, []);
  assert.equal(out.counts.inRadar, 1);
});

test('mục ĐÃ TICK ở board cũ không phải nợ', () => {
  const out = call([
    { date: '2026-08-10', items: [it('GW-627: việc đã xong', true)] },
    { date: '2026-08-12', items: [] },
  ]);
  assert.deepEqual(out.groups, []);
  assert.equal(out.counts.dropped, 0);
});

// Ca cũ ở đây khẳng định "mục đã tick trên board hôm nay VẪN giữ ticket trong radar". Đã ĐẢO
// ngày 12/8 — xem khối "D." ở cuối file để biết lý do và số đo.

test('mục không gắn ticket ở board cũ ⇒ rơi radar (không có cách nào biết nó còn sống)', () => {
  const out = call([
    { date: '2026-08-10', items: [it('dọn lại thư mục designs')] },
    { date: '2026-08-12', items: [] },
  ]);
  assert.equal(out.groups.length, 1);
  assert.equal(out.groups[0].key, null);
});

test('board HÔM NAY không bao giờ tự thành nợ của chính nó', () => {
  const out = call([{ date: '2026-08-12', items: [it('GW-720: việc hôm nay')] }]);
  assert.deepEqual(out.groups, []);
  assert.equal(out.counts.dropped, 0);
});

// Ca cũ ở đây khẳng định "không có board hôm nay ⇒ mọi mục cũ đều là nợ". Đã ĐẢO ngày 12/8 —
// board MỚI NHẤT chính là board đang hiện ở khối "Cần bạn", xem khối "C." ở cuối file.

/* ─────────────────── gom nhóm & thứ tự ─────────────────── */

test('gom nhiều mục cùng ticket vào MỘT nhóm, tuổi nhóm = mục cũ nhất', () => {
  const out = call([
    { date: '2026-08-05', items: [it('GW-627: việc rất cũ')] },
    { date: '2026-08-10', items: [it('GW-627: việc a'), it('GW-627: việc b')] },
    { date: '2026-08-12', items: [] },
  ]);
  assert.equal(out.groups.length, 1);
  assert.equal(out.groups[0].items.length, 3);
  assert.equal(out.groups[0].staleDays, 7);
  assert.equal(out.groups[0].oldestDate, '2026-08-05');
});

test('nhóm sắp CŨ NHẤT TRƯỚC — cũ nhất là cái dễ quên nhất', () => {
  const out = call([
    { date: '2026-08-11', items: [it('GW-720: mới')] },
    { date: '2026-08-05', items: [it('GW-627: cũ')] },
    { date: '2026-08-12', items: [] },
  ]);
  assert.deepEqual(
    out.groups.map((g) => g.key),
    ['GW-627', 'GW-720']
  );
});

test('mục trong nhóm cũng cũ nhất trước', () => {
  const out = call([
    { date: '2026-08-11', items: [it('GW-627: mới hơn')] },
    { date: '2026-08-05', items: [it('GW-627: cũ hơn')] },
    { date: '2026-08-12', items: [] },
  ]);
  assert.deepEqual(
    out.groups[0].items.map((i) => i.date),
    ['2026-08-05', '2026-08-11']
  );
});

test('ticket closed/reassigned đánh dấu offMyPlate để UI gộp cuối và folded sẵn', () => {
  const out = call([
    { date: '2026-08-06', items: [it('GW-660: lệch bản pm__ cần anh quyết')] },
    { date: '2026-08-10', items: [it('GW-654: còn nợ bàn giao')] },
    { date: '2026-08-10', items: [it('GW-627: báo designer')] },
    { date: '2026-08-12', items: [] },
  ]);
  assert.deepEqual(
    out.groups.filter((g) => g.offMyPlate).map((g) => g.key),
    ['GW-660', 'GW-654']
  );
  assert.equal(out.groups.find((g) => g.key === 'GW-627').offMyPlate, false);
});

test('ticket không có trong state thì KHÔNG bị coi là offMyPlate — không lặng lẽ giấu đi', () => {
  const out = call([
    { date: '2026-08-10', items: [it('GW-999: ticket lạ')] },
    { date: '2026-08-12', items: [] },
  ]);
  assert.equal(out.groups[0].offMyPlate, false);
  assert.equal(out.groups[0].phase, null);
});

test('counts đếm đúng: dropped theo MỤC, tickets theo NHÓM', () => {
  const out = call([
    { date: '2026-08-10', items: [it('GW-627: a'), it('GW-627: b'), it('GW-660: c')] },
    { date: '2026-08-12', items: [] },
  ]);
  assert.equal(out.counts.dropped, 3);
  assert.equal(out.counts.tickets, 2);
});

test('giữ `index` của mục để tick được vào đúng board gốc', () => {
  const out = call([
    { date: '2026-08-10', items: [it('GW-720: còn trong radar'), it('GW-627: rơi')] },
    { date: '2026-08-12', items: [it('GW-720: hôm nay')] },
  ]);
  assert.deepEqual(out.groups[0].items[0], {
    date: '2026-08-10',
    index: 1,
    text: 'GW-627: rơi',
    staleDays: 2,
  });
});

test('board của NGÀY MAI (đồng hồ lệch) không được tính thành nợ âm ngày', () => {
  const out = call([
    { date: '2026-08-13', items: [it('GW-627: board tương lai')] },
    { date: '2026-08-12', items: [] },
  ]);
  assert.deepEqual(out.groups, []);
});

test('boards rỗng / thiếu tham số → sổ rỗng, không nổ', () => {
  assert.deepEqual(buildDebt({ boards: [], today: '2026-08-12', state: {} }).groups, []);
  assert.deepEqual(buildDebt({}).groups, []);
});

/* ═══════════ C. "board hôm nay" phải khớp lib/board.js::readBoard ═══════════ */

/**
 * Ca do review đối kháng bắt được. `readBoard()` (lib/board.js) khi CHƯA có board hôm nay thì
 * FALLBACK sang board mới nhất — đó là board đang hiện ở khối "Cần bạn". Nếu buildDebt so cứng
 * `date === today` thì đúng những mục đang hiện ở "Cần bạn" lại bị đồng thời báo là "rơi radar",
 * kèm alert crit + notification macOS.
 *
 * Không phải ca hiếm: 14 ngày 30/7–12/8 có 4 ngày KHÔNG có board (2/8 và 7–9/8, cuối tuần).
 */
test('chưa có board hôm nay → board MỚI NHẤT là radar, mục của nó không phải nợ', () => {
  const out = call(
    [
      { date: '2026-08-06', items: [it('GW-627: việc đang hiện ở khối Cần bạn')] },
      { date: '2026-08-05', items: [it('GW-660: việc cũ thật')] },
    ],
    '2026-08-09'
  );
  assert.deepEqual(
    out.groups.map((g) => g.key),
    ['GW-660'],
    'GW-627 đang hiện ở "Cần bạn" (board 6/8 là board mới nhất) nên KHÔNG được báo là rơi radar'
  );
});

test('chưa có board hôm nay: staleDays vẫn đếm tới HÔM NAY, không tới board mới nhất', () => {
  const out = call(
    [
      { date: '2026-08-06', items: [it('GW-627: trong radar')] },
      { date: '2026-08-05', items: [it('GW-660: nợ')] },
    ],
    '2026-08-09'
  );
  assert.equal(out.groups[0].items[0].staleDays, 4);
});

test('có board hôm nay thì board mới nhất KHÔNG được lấn quyền radar', () => {
  const out = call([
    { date: '2026-08-11', items: [it('GW-627: việc cũ')] },
    { date: '2026-08-12', items: [it('GW-720: việc hôm nay')] },
  ]);
  assert.deepEqual(
    out.groups.map((g) => g.key),
    ['GW-627']
  );
});

test('radarDate được phơi ra để UI/log nói đúng đang so với board nào', () => {
  const out = call([{ date: '2026-08-06', items: [it('GW-627: x')] }], '2026-08-09');
  assert.equal(out.radarDate, '2026-08-06');
});

/* ═══════════ D. mục ĐÃ TICK không còn được coi là "hôm nay có nhắc" ═══════════ */

/**
 * ĐẢO quyết định của lượt trước (ca test cũ khẳng định điều ngược lại). Lý do đảo: mục đã tick
 * là việc đã ĐÓNG, không phải lời nhắc. Để nó giữ ticket trong radar thì một mục đã tick về việc
 * KHÁC sẽ che hết các mục còn mở của cùng ticket — đúng kiểu "mất im lặng" mà repo này vẫn tránh.
 * Đo trên dữ liệu thật 12/8: đổi luật này KHÔNG làm lộ thêm việc nào (41/7 trước và sau), nên
 * không thêm tiếng ồn — chỉ bịt lỗ.
 */
test('board hôm nay chỉ có mục ĐÃ TICK → không che được mục còn mở của cùng ticket', () => {
  const out = call([
    { date: '2026-08-10', items: [it('GW-627: báo designer 3 lỗi design')] },
    { date: '2026-08-12', items: [it('GW-627: duyệt push', true)] },
  ]);
  assert.deepEqual(
    out.groups.map((g) => g.key),
    ['GW-627']
  );
});

test('board hôm nay có mục CÒN MỞ của ticket thì vẫn là radan bình thường', () => {
  const out = call([
    { date: '2026-08-10', items: [it('GW-627: việc cũ')] },
    { date: '2026-08-12', items: [it('GW-627: việc còn mở hôm nay')] },
  ]);
  assert.deepEqual(out.groups, []);
});
