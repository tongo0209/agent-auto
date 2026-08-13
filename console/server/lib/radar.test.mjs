import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const { radarStatus } = createRequire(import.meta.url)('./radar.js');

const CFG = { enabled: true, days: [1, 2, 3, 4, 5], hours: [8, 18] };
const monday = new Date(2026, 7, 10, 14, 0);
const iso = (ms) => new Date(ms).toISOString();

test('tắt công tắc thì báo tắt, không báo hỏng', () => {
  assert.equal(radarStatus({ rows: [], cfg: { ...CFG, enabled: false }, now: monday }).level, 'off');
});

test('ngoài giờ thì im là ĐÚNG — không được vẽ đỏ suốt đêm và cuối tuần', () => {
  assert.equal(radarStatus({ rows: [], cfg: CFG, now: new Date(2026, 7, 8, 22, 0) }).level, 'off-hours');
});

test('trong giờ mà lượt cuối quá 90 phút = chết', () => {
  const rows = [{ at: iso(monday.getTime() - 100 * 60e3), ok: true }];
  assert.equal(radarStatus({ rows, cfg: CFG, now: monday }).level, 'dead');
});

test('trong giờ, lượt cuối vừa xong = ok, và nhớ mốc thay đổi gần nhất', () => {
  const rows = [
    { at: iso(monday.getTime() - 60 * 60e3), ok: true, changed: true },
    { at: iso(monday.getTime() - 5 * 60e3), ok: true, changed: false },
  ];
  const s = radarStatus({ rows, cfg: CFG, now: monday });
  assert.equal(s.level, 'ok');
  assert.equal(s.lastChangedAt, rows[0].at);
});

test('ngưỡng chết suy TỪ nhịp: nhịp 60 thì 100 phút chưa phải chết, nhịp 30 thì chết', () => {
  const rows = [{ at: iso(monday.getTime() - 100 * 60e3), ok: true }];
  assert.equal(radarStatus({ rows, cfg: { ...CFG, everyMin: 60 }, now: monday }).level, 'ok');
  assert.equal(radarStatus({ rows, cfg: { ...CFG, everyMin: 30 }, now: monday }).level, 'dead');
});

test('3 lượt hỏng liên tiếp = chết dù vừa chạy xong', () => {
  const rows = [3, 2, 1].map((i) => ({ at: iso(monday.getTime() - i * 60e3), ok: false }));
  assert.equal(radarStatus({ rows, cfg: CFG, now: monday }).level, 'dead');
});

test('lượt bị bỏ không được tính là lượt chạy — 3 lần bỏ liên tiếp vẫn phải thấy là chết', () => {
  const rows = [
    { at: iso(monday.getTime() - 100 * 60e3), ok: true },
    ...[3, 2, 1].map((i) => ({ at: iso(monday.getTime() - i * 60e3), skipped: 'human' })),
  ];
  assert.equal(radarStatus({ rows, cfg: CFG, now: monday }).level, 'dead');
});
