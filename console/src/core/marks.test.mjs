import { test } from 'node:test';
import assert from 'node:assert';
import { layoutMarks, rowClass, keepOnTimeline } from './marks.mjs';

// Trục giả: 2026-08-01 → 2026-08-20, mỗi ngày cách nhau 5%; ngoài dải trả null như trục thật.
// "hôm nay" = 2026-08-03, nên mốc cuối trục cách hôm nay 17 ngày (maxDays trong các ca dưới).
const DAY = 86400000;
const diff = (from, to) => Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / DAY);
const pctOf = (iso) => {
  const i = diff('2026-08-01', iso);
  return i >= 0 && i <= 19 ? i * 5 : null;
};
const daysUntilOf = (iso) => diff('2026-08-03', iso);

test('key ghi chú `_` không bao giờ thành chấm mốc', () => {
  const marks = layoutMarks({ html: '2026-08-05', _conflict: 'Jira 5/8 vs nexus 17/8' }, { pctOf, daysUntilOf });
  assert.deepEqual(marks.map((m) => m.name), ['html']);
});

test('mốc ĐÃ QUA nằm trước trục thì bỏ', () => {
  const marks = layoutMarks({ html: '2026-07-20' }, { pctOf, daysUntilOf, maxDays: 17 });
  assert.equal(marks.length, 0);
});

// Mốc release hay rơi ngoài khung 28 ngày (ca thật GW-654: release 1/9 trong khi trục hết 30/8).
// Bỏ hẳn = mất đúng thông tin user cần để canh fix kịp — ghim mép phải và ĐÁNH DẤU `off`
// để nhãn nói rõ đây là mốc ngoài khung, không phải mốc đúng ngày ở mép.
test('mốc vượt khung phải được ghim mép phải và đánh dấu off', () => {
  const marks = layoutMarks({ release: '2026-09-30' }, { pctOf, daysUntilOf, maxDays: 17 });
  assert.equal(marks.length, 1);
  assert.equal(marks[0].off, true);
  assert.equal(marks[0].left, 100);
  assert.equal(marks[0].showLabel, true);
});

// Ca thật GW-525: review2 31/8 VÀ release 19/9 đều ngoài khung → cả hai cùng ghim 100% thì
// 2 chấm + 2 nhãn đè lên nhau ở mép phải. Gộp thành MỘT chấm mang mốc SỚM NHẤT (nó tới trước,
// là cái phải canh trước), đếm số mốc còn lại vào `moreOff` để nhãn nói "+n".
test('nhiều mốc ngoài khung gộp thành một chấm mang mốc sớm nhất', () => {
  const marks = layoutMarks(
    { review2: '2026-08-31', release: '2026-09-19' },
    { pctOf, daysUntilOf, maxDays: 17 }
  );
  const offs = marks.filter((m) => m.off);
  assert.equal(offs.length, 1);
  assert.equal(offs[0].name, 'review2');
  assert.equal(offs[0].moreOff, 1);
});

test('một mốc ngoài khung duy nhất thì moreOff = 0', () => {
  const marks = layoutMarks({ release: '2026-09-30' }, { pctOf, daysUntilOf, maxDays: 17 });
  assert.equal(marks[0].moreOff, 0);
});

// Mốc off là thứ DUY NHẤT nói được "release nằm ngoài khung nhìn" — nếu để luật giãn nhãn
// (minGapPct) bịt nó vì có mốc khác sát mép phải thì hàng đó lại thành không đọc được ngày.
test('nhãn mốc ngoài khung luôn hiện dù có mốc khác sát mép phải', () => {
  const marks = layoutMarks(
    { test: '2026-08-20', release: '2026-09-30' },
    { pctOf, daysUntilOf, maxDays: 17, minGapPct: 10 }
  );
  const release = marks.find((m) => m.name === 'release');
  assert.equal(release.left, 100);
  assert.equal(release.showLabel, true);
});

// Nhãn mốc off dài hơn nhãn thường nhiều lần ("Review 2 08/31 +1 →" vs "Test") và đổ NGƯỢC về
// bên trái, nên khoảng cách an toàn phải rộng hơn `minGapPct`. Ca thật GW-525 trên màn: Review 1
// (cách 23%) vẫn được nhãn → hai chữ dính liền "Review 1Review 2 08/31 +1".
test('mốc thường nằm trong vùng nhãn của mốc off thì mất nhãn', () => {
  const marks = layoutMarks(
    { review1: '2026-08-17', release: '2026-09-30' },
    { pctOf, daysUntilOf, maxDays: 17, minGapPct: 10, offGapPct: 25 }
  );
  assert.equal(marks.find((m) => m.name === 'release').showLabel, true);
  assert.equal(marks.find((m) => m.name === 'review1').showLabel, false);
});

test('mốc thường đủ xa mốc off thì vẫn giữ nhãn', () => {
  const marks = layoutMarks(
    { review1: '2026-08-05', release: '2026-09-30' },
    { pctOf, daysUntilOf, maxDays: 17, minGapPct: 10, offGapPct: 25 }
  );
  assert.equal(marks.find((m) => m.name === 'review1').showLabel, true);
});

test('mốc trong khung KHÔNG bị đánh dấu off', () => {
  const marks = layoutMarks({ release: '2026-08-10' }, { pctOf, daysUntilOf, maxDays: 17 });
  assert.equal(marks[0].off, false);
});

test('2 mốc gần nhau: chỉ 1 nhãn hiện', () => {
  const marks = layoutMarks({ test: '2026-08-05', release: '2026-08-06' }, { pctOf, daysUntilOf, minGapPct: 10 });
  assert.deepEqual(marks.map((m) => m.showLabel), [true, false]);
});

test('mốc HTML luôn giành được nhãn dù đứng sau mốc khác', () => {
  const marks = layoutMarks({ design: '2026-08-05', html: '2026-08-06' }, { pctOf, daysUntilOf, minGapPct: 10 });
  const html = marks.find((m) => m.name === 'html');
  const design = marks.find((m) => m.name === 'design');
  assert.equal(html.showLabel, true);
  assert.equal(design.showLabel, false);
});

// ── keepOnTimeline: ai được vẽ hàng trên timeline ────────────────────────────────────────
// Luật user chốt 6/8, phân biệt 2 kiểu "ra khỏi tay" mà bản cũ gộp làm một:
//  · `closed`     = việc CỦA MÌNH đã xong → vẫn phải thấy ngày Test/Release để canh fix kịp.
//  · `reassigned` = việc đã sang người khác → KHÔNG còn tồn tại bên mình, theo dõi mốc là nhiễu.
const DONE = ['closed'];
const GONE = ['reassigned'];
const opts = { donePhases: DONE, gonePhases: GONE, daysUntilOf };

test('ticket đã đóng mà CÒN mốc tương lai thì vẫn được vẽ', () => {
  const issue = { phase: 'closed', milestones: { html: '2026-08-03', release: '2026-08-26' } };
  assert.equal(keepOnTimeline(issue, opts), true);
});

// Mốc của người nhận không phải deadline của mình — vẽ ra chỉ tổ đọc nhầm thành việc còn nợ.
test('ticket đã chuyển người thì KHÔNG vẽ, dù còn mốc tương lai', () => {
  const issue = { phase: 'reassigned', milestones: { release: '2026-09-01' } };
  assert.equal(keepOnTimeline(issue, opts), false);
});

// Đối chứng: hết sạch mốc tương lai thì không còn gì để canh → bỏ hàng, không để timeline
// phình mãi theo số ticket đã đóng.
test('ticket đã đóng mà mọi mốc đã qua thì bỏ khỏi timeline', () => {
  const issue = { phase: 'closed', milestones: { html: '2026-08-01', duedate: '2026-08-02' } };
  assert.equal(keepOnTimeline(issue, opts), false);
});

test('ticket đã đóng không có mốc nào thì bỏ khỏi timeline', () => {
  assert.equal(keepOnTimeline({ phase: 'closed' }, opts), false);
});

// Key ghi chú `_conflict` là chữ, không phải ngày — không được đọc thành "còn mốc tương lai".
test('key ghi chú `_` không giữ được ticket đã đóng trên timeline', () => {
  const issue = { phase: 'closed', milestones: { _conflict: 'Jira 5/8 vs nexus 17/8' } };
  assert.equal(keepOnTimeline(issue, opts), false);
});

// Ticket CÒN TRONG TAY luôn có hàng, kể cả khi mốc đã qua hết (đang trễ vẫn phải thấy).
test('ticket còn trong tay luôn được vẽ dù mốc đã qua', () => {
  const issue = { phase: 'coding', milestones: { html: '2026-08-01' } };
  assert.equal(keepOnTimeline(issue, opts), true);
});

// Chặn hồi quy: `done-fe` (FE xong, mốc còn lại là việc BE/QC) phải VẪN có hàng nhưng vẽ mờ.
// Trước đây luật này nằm inline trong gantt.js và không có ca test nào canh — review đã bắt lỗi
// đó, nên tách rowClass() ra core/marks.mjs để có thể test độc lập với webpack/icon loader.
test('phase done-fe được vẽ mờ (class chứa dim)', () => {
  const cls = rowClass('done-fe', ['done-fe']);
  assert.match(cls, /\bdim\b/);
});

// Đối chứng bắt buộc: nếu thiếu ca này, một hàm luôn trả 'grow dim' vẫn pass ca trên mà không
// ai phát hiện ra rowClass đã hỏng (dim mọi phase, không riêng gì done-fe).
test('phase coding (không thuộc dimPhases) KHÔNG bị vẽ mờ', () => {
  const cls = rowClass('coding', ['done-fe']);
  assert.doesNotMatch(cls, /\bdim\b/);
});

// dimPhases đến từ constants.mjs thật ở gantt.js, nhưng rowClass không được phép giả định vocab
// đó — phase lạ/chưa khai báo không được làm hàm nổ, chỉ đơn giản là không mờ.
test('phase lạ không có trong dimPhases thì không dim và không nổ', () => {
  const cls = rowClass('some-unknown-phase', ['done-fe']);
  assert.doesNotMatch(cls, /\bdim\b/);
});
