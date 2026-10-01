import { test } from 'node:test';
import assert from 'node:assert';
import queue from './queue.js';

const { buildQueue, itemId, applySnooze, pruneSnoozes } = queue;

const TODAY = '2026-10-01';
const ISSUES = {
  'GW-1': { phase: 'coding', milestones: { html: '2026-10-02', release: '2026-10-10' } },
  'GW-2': { phase: 'coding', milestones: { html: '2026-10-20' } },
  'GW-3': { phase: 'wait-test', milestones: {} },
};
const base = (over = {}) => ({
  today: TODAY,
  issues: ISSUES,
  alerts: [],
  doctor: { errors: [], warns: [] },
  board: { boardDate: TODAY, needYou: [] },
  debt: { groups: [] },
  review: [],
  bugs: [],
  snoozes: {},
  ...over,
});
const ids = (list) => list.map((i) => i.id);

test('alert crit lên now hạng 0, warn xuống hạng 3, sort theo hạng rồi mốc kế', () => {
  const q = buildQueue(
    base({
      alerts: [
        { key: 'GW-2', code: 'stale', level: 'warn', text: 'đứng yên' },
        { key: 'GW-1', code: 'html-near', level: 'warn', text: 'mốc gần' },
        { key: 'GW-1', code: 'html-urgent', level: 'crit', text: 'còn 1 ngày' },
      ],
    })
  );
  assert.deepStrictEqual(ids(q.now), ['alert:html-urgent:GW-1', 'alert:html-near:GW-1', 'alert:stale:GW-2']);
  assert.strictEqual(q.now[0].rank, 0);
  assert.strictEqual(q.now[0].due, '2026-10-02');
  assert.deepStrictEqual(q.now[0].action, { kind: 'ticket', key: 'GW-1' });
});

test('qc-test-no-buglist và design-overdue vào nhóm chờ, kèm tin nhắn để chép', () => {
  const q = buildQueue(
    base({
      alerts: [
        { key: 'GW-3', code: 'qc-test-no-buglist', level: 'warn', text: 'chưa có buglist' },
        { key: 'GW-2', code: 'design-overdue', level: 'crit', text: 'mốc design đã qua' },
      ],
    })
  );
  assert.strictEqual(q.now.length, 0);
  assert.deepStrictEqual(ids(q.waiting).sort(), ['alert:design-overdue:GW-2', 'alert:qc-test-no-buglist:GW-3']);
  for (const item of q.waiting) {
    assert.strictEqual(item.action.kind, 'copy');
    assert.match(item.action.message, new RegExp(item.key));
  }
});

test('alert gom debt-dropped bị bỏ vì nhóm nợ đã thay nó; code lạ vẫn hiện ở now', () => {
  const q = buildQueue(
    base({
      alerts: [
        { key: '', code: 'debt-dropped', level: 'warn', text: '12 việc' },
        { key: 'GW-2', code: 'chua-tung-co', level: 'warn', text: 'lạ' },
      ],
    })
  );
  assert.deepStrictEqual(ids(q.now), ['alert:chua-tung-co:GW-2']);
  assert.strictEqual(q.now[0].rank, 3);
});

test('bug-reopened mang lệnh fix bug và dedup vào id', () => {
  const q = buildQueue(
    base({
      alerts: [{ key: 'GW-1', code: 'bug-reopened', level: 'crit', text: '2 bug', dedup: 's1:4,7', sheetUrl: 'https://x' }],
    })
  );
  assert.strictEqual(q.now[0].id, 'alert:bug-reopened:GW-1:s1:4,7');
  assert.deepStrictEqual(q.now[0].action, { kind: 'fixbug', sheetUrl: 'https://x' });
});

test('doctor: error là crit hạng 0, warn gom 1 dòng hạng 3', () => {
  const q = buildQueue(
    base({
      doctor: {
        errors: [{ key: 'GW-1', code: 'E7', text: 'icon lạ' }],
        warns: [
          { key: 'GW-2', code: 'W3', text: 'a' },
          { key: 'GW-3', code: 'W8', text: 'b' },
        ],
      },
    })
  );
  assert.deepStrictEqual(ids(q.now), ['doctor:E7:GW-1', 'doctor:warns:']);
  assert.strictEqual(q.now[0].level, 'crit');
  assert.match(q.now[1].text, /2 cảnh báo/);
});

test('Cần bạn: chỉ dòng chưa tick, giữ index gốc để tick đúng dòng', () => {
  const q = buildQueue(base({ board: { boardDate: TODAY, needYou: ['~~xong rồi~~', 'GW-1: báo designer'] } }));
  assert.strictEqual(q.now.length, 1);
  assert.deepStrictEqual(q.now[0].action, { kind: 'need-check', date: TODAY, index: 1, text: 'GW-1: báo designer' });
  assert.strictEqual(q.now[0].key, 'GW-1');
  assert.match(q.now[0].id, /^need:[0-9a-f]{10}$/);
});

test('review chỉ lên khi có việc thật; bug chờ duyệt gom 1 dòng/sheet', () => {
  const q = buildQueue(
    base({
      review: [
        { key: 'GW-1', dirty: 4, unpushed: 0 },
        { key: 'GW-2', dirty: 0, unpushed: 0 },
        { key: 'GW-3', dirty: 0, unpushed: 2 },
      ],
      bugs: [
        { sheetId: 's1', sheetTitle: 'Buglist A', keys: ['GW-1'], grade: 'verified' },
        { sheetId: 's1', sheetTitle: 'Buglist A', keys: ['GW-1'], grade: 'unverified' },
      ],
    })
  );
  assert.deepStrictEqual(ids(q.now), ['bugs:s1', 'review:GW-1', 'review:GW-3']);
  assert.match(q.now[0].text, /2 bug/);
  assert.match(q.now[1].text, /4 file chưa commit/);
  assert.match(q.now[2].text, /2 commit chưa push/);
});

test('nợ: mỗi mục 1 dòng, cũ nhất lên đầu, tick ghi về board gốc', () => {
  const q = buildQueue(
    base({
      debt: {
        groups: [
          {
            key: 'GW-2',
            items: [
              { date: '2026-09-20', index: 0, text: 'việc mới hơn', staleDays: 11 },
              { date: '2026-07-30', index: 3, text: 'việc cũ', staleDays: 63 },
            ],
          },
        ],
      },
    })
  );
  assert.deepStrictEqual(
    q.debt.map((i) => i.text),
    ['việc cũ', 'việc mới hơn']
  );
  assert.deepStrictEqual(q.debt[0].action, { kind: 'debt-check', date: '2026-07-30', index: 3, text: 'việc cũ' });
  assert.match(q.debt[0].id, /^debt:2026-07-30:[0-9a-f]{10}$/);
});

test('nợ không gắn ticket xếp sau nợ có ticket và mang cờ loose', () => {
  const q = buildQueue(
    base({
      debt: {
        groups: [
          { key: null, items: [{ date: '2026-07-01', index: 0, text: 'việc trôi nổi', staleDays: 92 }] },
          { key: 'GW-2', items: [{ date: '2026-09-20', index: 1, text: 'việc của GW-2', staleDays: 11 }] },
        ],
      },
    })
  );
  assert.deepStrictEqual(
    q.debt.map((i) => [i.text, i.loose]),
    [
      ['việc của GW-2', false],
      ['việc trôi nổi', true],
    ]
  );
});

test('id không đổi khi chữ alert đổi theo ngày', () => {
  const a = itemId({ source: 'alert', code: 'html-urgent', key: 'GW-1' });
  const b = itemId({ source: 'alert', code: 'html-urgent', key: 'GW-1', text: 'khác chữ' });
  assert.strictEqual(a, b);
});

test('hoãn: ẩn tới hạn, hết hạn thì hiện lại, leo thang warn→crit thì hiện ngay', () => {
  const alerts = [
    { key: 'GW-2', code: 'stale', level: 'warn', text: 'đứng yên' },
    { key: 'GW-1', code: 'html-urgent', level: 'crit', text: 'còn 1 ngày' },
  ];
  const snoozes = {
    'alert:stale:GW-2': { until: '2026-10-03', level: 'warn' },
    'alert:html-urgent:GW-1': { until: '2026-10-03', level: 'warn' },
  };
  const q = buildQueue(base({ alerts, snoozes }));
  assert.deepStrictEqual(ids(q.now), ['alert:html-urgent:GW-1']);
  assert.deepStrictEqual(ids(q.snoozed), ['alert:stale:GW-2']);
  assert.strictEqual(q.snoozed[0].snoozedUntil, '2026-10-03');

  const later = buildQueue(base({ alerts, snoozes, today: '2026-10-03' }));
  assert.strictEqual(later.now.length, 2);
});

test('applySnooze ghi/bỏ hoãn; pruneSnoozes dọn mục hết hạn', () => {
  const s1 = applySnooze({}, { id: 'a', until: '2026-10-02', level: 'warn', text: 't' }, '2026-10-01T09:00:00Z');
  assert.deepStrictEqual(s1.a, { until: '2026-10-02', level: 'warn', text: 't', at: '2026-10-01T09:00:00Z' });
  assert.deepStrictEqual(applySnooze(s1, { id: 'a', until: null }), {});
  assert.deepStrictEqual(pruneSnoozes({ a: { until: '2026-10-01' }, b: { until: '2026-10-05' } }, '2026-10-01'), {
    b: { until: '2026-10-05' },
  });
});
