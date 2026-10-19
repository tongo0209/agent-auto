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

test('sub-task có cha trong state thì nằm dưới cha, không thành hàng riêng', () => {
  const r = groupTasks([mk('GW-901', 'done-fe'), mk('GW-950', 'bugfix', { parent: 'GW-901' })]);
  const rows = r.groups.flatMap((g) => g.items);
  assert.deepEqual(rows.map(([k]) => k), ['GW-901']);
  assert.deepEqual(rows[0][1].subs.map(([k]) => k), ['GW-950']);
});

test('cha đã xong FE mà sub-task còn mở thì cha hiện theo phase của sub-task', () => {
  const r = groupTasks([mk('GW-901', 'done-fe'), mk('GW-950', 'bugfix', { parent: 'GW-901' })]);
  const [, parent] = r.groups.flatMap((g) => g.items)[0];
  assert.equal(parent.shownPhase, 'bugfix');
  assert.equal(r.trackedTotal, 1);
});

test('sub-task nguội hơn cha thì không kéo cha xuống', () => {
  const r = groupTasks([mk('GW-909', 'coding'), mk('GW-952', 'waiting-design', { parent: 'GW-909' })]);
  assert.equal(r.groups.flatMap((g) => g.items)[0][1].shownPhase, 'coding');
});

test('sub-task đã đóng không làm cha nóng lên', () => {
  const r = groupTasks([mk('GW-1', 'done-fe'), mk('GW-2', 'closed', { parent: 'GW-1' })]);
  assert.equal(r.groups.flatMap((g) => g.items)[0][1].shownPhase, 'done-fe');
});

test('sub-task mà cha không có trong state thì vẫn là hàng riêng', () => {
  const r = groupTasks([mk('GW-950', 'bugfix', { parent: 'GW-999' })]);
  assert.deepEqual(r.groups.flatMap((g) => g.items).map(([k]) => k), ['GW-950']);
});

test('lọc trúng sub-task thì hiện cả cha', () => {
  const r = groupTasks([mk('GW-901', 'done-fe'), mk('GW-950', 'bugfix', { parent: 'GW-901' })], { filterText: 'GW-950' });
  assert.deepEqual(r.groups.flatMap((g) => g.items).map(([k]) => k), ['GW-901']);
});
