import { test } from 'node:test';
import assert from 'node:assert';
import phaselog from './phaselog.js';

const { cleanPhaseRows } = phaselog;
const sigs = (rows) => rows.map((r) => `${r.key}:${r.from ?? '—'}→${r.to}`);

test('bỏ dòng NO-OP (from === to) — ca thật GW-556 coding→coding', () => {
  const out = cleanPhaseRows([
    { at: '2026-08-03T10:00:00+07:00', key: 'GW-556', from: null, to: 'coding' },
    { at: '2026-08-03T10:56:00+07:00', key: 'GW-556', from: 'coding', to: 'coding' },
  ]);
  assert.deepEqual(sigs(out), ['GW-556:—→coding']);
});

test('bỏ dòng TRÙNG 2 nguồn dù cách nhau 18 phút — ca thật GW-654', () => {
  // /daily ghi kèm lý do lúc 10:21:40, observer console ghi lại lúc 10:39:39.
  // Mọi ngưỡng thời gian đều sai với ca này → phải chống trùng theo LIỀN KỀ.
  const out = cleanPhaseRows([
    { at: '2026-08-03T10:21:40+07:00', key: 'GW-654', from: 'coding', to: 'reassigned', reason: 'Jira đổi assignee' },
    { at: '2026-08-03T10:39:39+07:00', key: 'GW-654', from: 'coding', to: 'reassigned', reason: 'console-observed' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].reason, 'Jira đổi assignee'); // giữ dòng SỚM NHẤT, có lý do thật
});

test('GIỮ lần lặp thật khi có bước chuyển ngược chen giữa', () => {
  const out = cleanPhaseRows([
    { at: '2026-08-03T09:00:00+07:00', key: 'GW-1', from: 'coding', to: 'bugfix' },
    { at: '2026-08-03T11:00:00+07:00', key: 'GW-1', from: 'bugfix', to: 'coding' },
    { at: '2026-08-03T14:00:00+07:00', key: 'GW-1', from: 'coding', to: 'bugfix' },
  ]);
  assert.equal(out.length, 3);
});

test('chống trùng theo TỪNG ticket, không lẫn giữa các ticket', () => {
  const out = cleanPhaseRows([
    { at: '2026-08-03T09:00:00+07:00', key: 'GW-1', from: 'coding', to: 'bugfix' },
    { at: '2026-08-03T09:01:00+07:00', key: 'GW-2', from: 'coding', to: 'bugfix' },
  ]);
  assert.deepEqual(sigs(out), ['GW-1:coding→bugfix', 'GW-2:coding→bugfix']);
});

test('sắp lại theo thời gian dù file ghi lộn xộn, và chịu cả 2 định dạng `at`', () => {
  // Sổ thật có cả dạng có offset (`+0700` do /daily ghi) và dạng cũ thiếu offset (console ghi
  // trước 3/8). Sort sai thì "giữ dòng sớm nhất" sẽ giữ nhầm dòng.
  const out = cleanPhaseRows([
    { at: '2026-08-03T14:00:00+07:00', key: 'GW-1', from: 'bugfix', to: 'coding' },
    { at: '2026-08-03T09:00:00+07:00', key: 'GW-1', from: 'coding', to: 'bugfix' },
  ]);
  assert.deepEqual(sigs(out), ['GW-1:coding→bugfix', 'GW-1:bugfix→coding']);
});

test('bỏ dòng thiếu key/to/at — không nổ, không đếm oan', () => {
  const out = cleanPhaseRows([null, {}, { key: 'GW-1' }, { at: '2026-08-03T09:00:00+07:00', key: 'GW-1', to: 'coding' }]);
  assert.equal(out.length, 1);
});
