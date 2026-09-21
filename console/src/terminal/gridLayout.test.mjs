import { test } from 'node:test';
import assert from 'node:assert';
import { gridFor, visiblePanes, loadLayout, saveLayout } from './gridLayout.mjs';

const mkStorage = (init) => {
  const box = { v: init };
  return {
    getItem: () => box.v ?? null,
    setItem: (_k, v) => (box.v = v),
    read: () => box.v,
  };
};

test('lưới cố định không đổi theo số terminal', () => {
  assert.deepEqual(gridFor('2x2', 1), { cols: 2, rows: 2, cells: 4 });
  assert.deepEqual(gridFor('3x3', 9), { cols: 3, rows: 3, cells: 9 });
  assert.deepEqual(gridFor('1', 5), { cols: 1, rows: 1, cells: 1 });
});

test('tự động lấy lưới nhỏ nhất đủ chứa, hàng thừa không chiếm chỗ', () => {
  assert.deepEqual(gridFor('auto', 1), { cols: 1, rows: 1, cells: 1 });
  assert.deepEqual(gridFor('auto', 2), { cols: 2, rows: 1, cells: 2 });
  assert.deepEqual(gridFor('auto', 4), { cols: 2, rows: 2, cells: 4 });
  assert.deepEqual(gridFor('auto', 5), { cols: 3, rows: 2, cells: 6 });
  assert.deepEqual(gridFor('auto', 7), { cols: 3, rows: 3, cells: 9 });
});

// "xem tất cả" phải bung hết terminal đang mở: lưới tự chia theo số lượng thật, không giới hạn preset.
test('xem tất cả: lưới tự chia đủ chỗ cho mọi terminal', () => {
  assert.deepEqual(gridFor('all', 1), { cols: 1, rows: 1, cells: 1 });
  assert.deepEqual(gridFor('all', 5), { cols: 3, rows: 2, cells: 6 });
  assert.deepEqual(gridFor('all', 7), { cols: 3, rows: 3, cells: 9 });
  assert.deepEqual(gridFor('all', 12), { cols: 4, rows: 3, cells: 12 });
  for (const n of [1, 2, 3, 5, 8, 9, 11, 16, 20]) assert.ok(gridFor('all', n).cells >= n);
});

test('mode lạ coi như tự động', () => {
  assert.deepEqual(gridFor('4x4', 3), gridFor('auto', 3));
});

test('đủ ô thì hiện hết', () => {
  assert.deepEqual(visiblePanes(3, 4, 0), [0, 1, 2]);
});

// Terminal đang gõ mà rơi ra ngoài lưới thì nút toolbar gõ vào chỗ không nhìn thấy.
test('terminal đang gõ luôn nằm trong lưới', () => {
  assert.deepEqual(visiblePanes(7, 4, 5), [3, 4, 5, 6]);
  assert.ok(visiblePanes(7, 4, 0).includes(0));
  assert.ok(visiblePanes(9, 2, 8).includes(8));
});

test('không trả chỉ số vượt số terminal đang có', () => {
  const shown = visiblePanes(5, 4, 4);
  assert.deepEqual(shown, [1, 2, 3, 4]);
});

test('chưa lưu gì / dữ liệu hỏng → mặc định tự động, không toàn màn, không zoom', () => {
  const fresh = { mode: 'auto', fullWidth: false, zoomed: false };
  assert.deepEqual(loadLayout(mkStorage(undefined)), fresh);
  assert.deepEqual(loadLayout(mkStorage('{{{ hỏng')), fresh);
  assert.deepEqual(loadLayout(mkStorage('{"mode":"9x9"}')), fresh);
});

test('nhớ lại đúng bố cục đã chọn, kể cả đang phóng to 1 ô', () => {
  const s = mkStorage(undefined);
  saveLayout(s, { mode: '3x2', fullWidth: true, zoomed: false });
  assert.deepEqual(loadLayout(s), { mode: '3x2', fullWidth: true, zoomed: false });
  saveLayout(s, { mode: 'all', fullWidth: false, zoomed: true });
  assert.deepEqual(loadLayout(s), { mode: 'all', fullWidth: false, zoomed: true });
});
