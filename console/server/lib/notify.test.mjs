import { test } from 'node:test';
import assert from 'node:assert';
import { shouldNotify, notifyNewCrits } from './notify.js';

const NOW = Date.parse('2026-08-03T11:00:00+07:00');
const crit = { key: 'GW-1', code: 'html-urgent', level: 'crit', text: 'mốc HTML còn 1 ngày' };
const on = { notify: true };

test('alert crit chưa từng nhắc → nhắc', () => {
  assert.equal(shouldNotify(crit, [], NOW, on), true);
});

test('vừa nhắc trong 12h → im', () => {
  const log = [{ at: '2026-08-03T06:00:00+07:00', key: 'GW-1', code: 'html-urgent' }];
  assert.equal(shouldNotify(crit, log, NOW, on), false);
});

test('quá 12h → nhắc lại', () => {
  const log = [{ at: '2026-08-02T20:00:00+07:00', key: 'GW-1', code: 'html-urgent' }];
  assert.equal(shouldNotify(crit, log, NOW, on), true);
});

test('công tắc notify=false → im hẳn', () => {
  assert.equal(shouldNotify(crit, [], NOW, { notify: false }), false);
});

test('mức warn không nhắc — chỉ crit mới xứng đáng chen ra ngoài trang', () => {
  assert.equal(shouldNotify({ ...crit, level: 'warn' }, [], NOW, on), false);
});

test('notifyNewCrits chỉ trả về những alert đáng nhắc', () => {
  const r = notifyNewCrits({
    alerts: [crit, { ...crit, key: 'GW-2' }, { ...crit, key: 'GW-3', level: 'warn' }],
    log: [{ at: '2026-08-03T10:00:00+07:00', key: 'GW-2', code: 'html-urgent' }],
    nowMs: NOW,
    config: on,
  });
  assert.deepEqual(r.sent.map((a) => a.key), ['GW-1']);
});
