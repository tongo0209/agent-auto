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

/* ─── Critical 2 (21/9): 13/25 buglist không có mã task ⇒ key='' đè dedup của nhau ─── */

const reopened = (dedup) => ({ key: '', code: 'bug-reopened', level: 'crit', text: 'bug bị mở lại', dedup });

test('2 buglist không có mã task cùng bị mở lại → cả hai đều được nhắc', () => {
  const r = notifyNewCrits({
    alerts: [reopened('sheetA:12'), reopened('sheetB:7')],
    log: [],
    nowMs: NOW,
    config: on,
  });
  assert.equal(r.sent.length, 2, 'không sheet nào được nuốt thông báo của sheet kia');
});

test('sheet đã nhắc, đợt sau bug KHÁC → vẫn nhắc dù chưa quá 12h', () => {
  const log = [{ at: '2026-08-03T10:00:00+07:00', key: '', code: 'bug-reopened', dedup: 'sheetA:12' }];
  assert.equal(shouldNotify(reopened('sheetA:12'), log, NOW, on), false, 'cùng danh sách bug thì vẫn là trùng');
  assert.equal(shouldNotify(reopened('sheetA:20'), log, NOW, on), true);
});

test('alert không có dedup vẫn so theo (key, code) như cũ', () => {
  const log = [{ at: '2026-08-03T10:00:00+07:00', key: 'GW-1', code: 'html-urgent', dedup: null }];
  assert.equal(shouldNotify(crit, log, NOW, on), false);
});
