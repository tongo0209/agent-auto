import { test } from 'node:test';
import assert from 'node:assert';
import { buildDelta } from './delta.js';

const rows = [
  { at: '2026-08-03T08:00:00+07:00', key: 'GW-1', status: 'To Do', phase: 'coding', duedate: '2026-08-07', milestones: { html: '2026-08-07' } },
  { at: '2026-08-03T11:00:00+07:00', key: 'GW-1', status: 'In Progress', phase: 'coding', duedate: '2026-08-07', milestones: { html: '2026-08-10' } },
];

test('so với mốc thời gian: bắt đổi status và đổi mốc', () => {
  const items = buildDelta({ issueRows: rows, phaseRows: [], sinceISO: '2026-08-03T09:00:00+07:00' });
  const types = items[0].changes.map((c) => c.type).sort();
  assert.deepEqual(types, ['milestone', 'status']);
  const st = items[0].changes.find((c) => c.type === 'status');
  assert.deepEqual([st.from, st.to], ['To Do', 'In Progress']);
});

test('không có gì mới sau mốc → mảng rỗng', () => {
  const items = buildDelta({ issueRows: rows, phaseRows: [], sinceISO: '2026-08-03T12:00:00+07:00' });
  assert.deepEqual(items, []);
});

test('phase đổi lấy từ phases.jsonl kèm lý do', () => {
  const items = buildDelta({
    issueRows: rows,
    phaseRows: [{ at: '2026-08-03T10:00:00+07:00', key: 'GW-2', from: 'coding', to: 'done-fe', reason: 'PM nhận hàng' }],
    sinceISO: '2026-08-03T09:00:00+07:00',
  });
  const gw2 = items.find((i) => i.key === 'GW-2');
  assert.deepEqual([gw2.changes[0].type, gw2.changes[0].from, gw2.changes[0].to], ['phase', 'coding', 'done-fe']);
});

test('cùng 1 lần đổi phase ghi 2 nguồn → chỉ báo 1 thay đổi', () => {
  // Ca thật trên history/phases.jsonl 3/8: GW-660 done-fe→closed được /daily ghi kèm lý do,
  // rồi observer của console ghi lại 3 giây sau. Không dedupe thì đếm thành 2 việc.
  const items = buildDelta({
    issueRows: [],
    phaseRows: [
      { at: '2026-08-03T11:12:05+07:00', key: 'GW-660', from: 'done-fe', to: 'closed', reason: 'PM nhận hàng' },
      { at: '2026-08-03T11:12:08+07:00', key: 'GW-660', from: 'done-fe', to: 'closed', reason: 'console-observed' },
    ],
    sinceISO: '2026-08-03T09:00:00+07:00',
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].changes.length, 1);
  assert.equal(items[0].changes[0].reason, 'PM nhận hàng'); // giữ dòng ĐẦU (có lý do thật)
});

test('bản ghi no-op (from === to) không phải thay đổi', () => {
  // Đo thật 3/8: phases.jsonl có dòng GW-556 coding→coding. Báo lên UI là báo sai.
  const items = buildDelta({
    issueRows: [],
    phaseRows: [{ at: '2026-08-03T10:00:00+07:00', key: 'GW-556', from: 'coding', to: 'coding' }],
    sinceISO: '2026-08-03T09:00:00+07:00',
  });
  assert.deepEqual(items, []);
});

test('lặp THẬT (có bước chuyển ngược chen giữa) → báo đủ, dedupe không được nuốt', () => {
  // Vocab có phase `bugfix` nên vòng coding→bugfix→coding→bugfix là chuyện thường. Dedupe chỉ
  // được bỏ dòng TRÙNG KHÍT dòng vừa giữ; hễ có bước chuyển khác chen vào thì phải tính đủ.
  const items = buildDelta({
    issueRows: [],
    phaseRows: [
      { at: '2026-08-03T09:30:00+07:00', key: 'GW-1', from: 'coding', to: 'bugfix' },
      { at: '2026-08-03T11:00:00+07:00', key: 'GW-1', from: 'bugfix', to: 'coding' },
      { at: '2026-08-03T14:30:00+07:00', key: 'GW-1', from: 'coding', to: 'bugfix' },
    ],
    sinceISO: '2026-08-03T08:00:00+07:00',
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].changes.length, 3);
});

test('trùng 2 nguồn cách nhau 18 PHÚT vẫn phải gộp (ca thật GW-654 3/8)', () => {
  // /daily ghi 10:21:40 kèm lý do, observer console ghi lại 10:39:39. Mọi ngưỡng thời gian đều
  // sai với ca này — đó là lý do dedupe xét LIỀN KỀ chứ không xét khoảng cách thời gian.
  const items = buildDelta({
    issueRows: [],
    phaseRows: [
      { at: '2026-08-03T10:21:40+07:00', key: 'GW-654', from: 'coding', to: 'reassigned', reason: 'Jira đổi assignee' },
      { at: '2026-08-03T10:39:39+07:00', key: 'GW-654', from: 'coding', to: 'reassigned', reason: 'console-observed' },
    ],
    sinceISO: '2026-08-03T08:00:00+07:00',
  });
  assert.equal(items[0].changes.length, 1);
  assert.equal(items[0].changes[0].reason, 'Jira đổi assignee');
});

test('dòng thật TRƯỚC since + dòng trùng SAU since → không báo gì (lỗ Critical đã vá)', () => {
  // Ca thật: /daily ghi 10:21:40 (có lý do), observer console ghi lại 10:39:39. Nếu user xem lúc
  // 10:30 thì bản cũ báo dòng "console-observed" như một thay đổi MỚI và mất lý do thật.
  // Dedupe phải xét CẢ LỊCH SỬ, chỉ lọc `since` ở bước hiển thị.
  const items = buildDelta({
    issueRows: [],
    phaseRows: [
      { at: '2026-08-03T10:21:40+07:00', key: 'GW-654', from: 'coding', to: 'reassigned', reason: 'Jira đổi assignee' },
      { at: '2026-08-03T10:39:39+07:00', key: 'GW-654', from: 'coding', to: 'reassigned', reason: 'console-observed' },
    ],
    sinceISO: '2026-08-03T10:30:00+07:00',
  });
  assert.deepEqual(items, []);
});

test('console ghi phase kèm offset múi giờ — thiếu offset là đảo thứ tự khi đọc ở múi khác', async () => {
  const { nowISO } = await import('./learn.js').then((m) => m.default ?? m);
  assert.match(nowISO(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
});

test('mốc đổi báo THEO TỪNG MỐC, không nhả khối JSON, và bỏ key ghi chú `_`', () => {
  // Đo thật: bản trước nhả `{"design":...,"_note":...}→{"duedate":...}` lên UI — không đọc được,
  // lại tính cả `_note` (ghi chú của skill) như một mốc.
  const items = buildDelta({
    issueRows: [
      { at: '2026-08-03T08:00:00+07:00', key: 'GW-1', status: 'To Do', milestones: { html: '2026-08-07', _note: 'x' } },
      { at: '2026-08-03T11:00:00+07:00', key: 'GW-1', status: 'To Do', milestones: { html: '2026-08-10', _note: 'y', test: '2026-08-20' } },
    ],
    sinceISO: '2026-08-03T09:00:00+07:00',
  });
  const ms = items[0].changes.filter((c) => c.type === 'milestone');
  assert.deepEqual(
    ms.map((c) => `${c.name}:${c.from ?? '—'}→${c.to}`),
    ['html:2026-08-07→2026-08-10', 'test:—→2026-08-20']
  );
});
