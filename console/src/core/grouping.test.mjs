import { test } from 'node:test';
import assert from 'node:assert';
import { groupTasks } from './grouping.mjs';

const mk = (key, phase, extra = {}) => [key, { phase, summary: key + ' summary', ...extra }];
const BASE = [
  mk('GW-1', 'coding'),
  mk('GW-2', 'waiting-design'),
  mk('GW-3', 'reassigned'),
  mk('GW-4', 'closed'),
];

test('phase LẠ vẫn ra dòng, gom vào nhóm riêng — không được mất im lặng', () => {
  const r = groupTasks([...BASE, mk('GW-9', 'phase-troi-oi')]);
  const orphan = r.groups.find((g) => g.label.startsWith('Phase lạ'));
  assert.equal(orphan.items.length, 1);
  assert.equal(r.orphanCount, 1);
});

test('trackedTotal = số task NGOÀI nhóm đóng sẵn (bug đếm lệch 3/8)', () => {
  const r = groupTasks(BASE);
  assert.equal(r.trackedTotal, 2); // GW-1, GW-2 — GW-3/GW-4 nằm trong nhóm đóng
});

test('nhóm đóng sẵn nằm cuối và mặc định folded', () => {
  const r = groupTasks(BASE);
  const last = r.groups[r.groups.length - 1];
  assert.equal(last.label, 'Đã xong / ra khỏi tay');
  assert.equal(last.folded, true);
});

test('user mở nhóm ra thì không tự đóng lại', () => {
  const r = groupTasks(BASE, { expanded: { 'Đã xong / ra khỏi tay': true } });
  assert.equal(r.groups[r.groups.length - 1].folded, false);
});

test('đang lọc thì nhóm đóng phải MỞ, không thì đọc thành "không tìm thấy"', () => {
  const r = groupTasks(BASE, { filterText: 'GW-3' });
  const g = r.groups.find((x) => x.label === 'Đã xong / ra khỏi tay');
  assert.equal(g.folded, false);
  assert.equal(r.trackedMatched, 0);
});

test('lọc khớp key, summary hoặc note', () => {
  const r = groupTasks([mk('GW-7', 'coding', { note: 'chờ cắt ảnh' })], { filterText: 'cắt ảnh' });
  assert.equal(r.groups[0].items.length, 1);
});
