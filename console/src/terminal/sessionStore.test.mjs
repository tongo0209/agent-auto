import { test } from 'node:test';
import assert from 'node:assert';
import { loadTabs, saveTabs, newSessionId } from './sessionStore.mjs';

/** localStorage giả */
const mkStorage = (init) => {
  const box = { v: init };
  return {
    getItem: () => box.v ?? null,
    setItem: (_k, v) => (box.v = v),
    read: () => box.v,
  };
};

test('chưa có gì lưu → không có tab nào', () => {
  assert.deepEqual(loadTabs(mkStorage(undefined)), []);
});

// Reload phải dựng lại ĐÚNG các tab cũ với ĐÚNG id, không thì có nối lại cũng trúng phiên khác.
test('đọc lại đúng danh sách tab đã lưu', () => {
  const s = mkStorage(JSON.stringify([{ id: 'a1', label: 'term 1' }, { id: 'b2', label: 'radar' }]));
  assert.deepEqual(loadTabs(s), [{ id: 'a1', label: 'term 1' }, { id: 'b2', label: 'radar' }]);
});

test('dữ liệu hỏng không làm sập console, chỉ coi như chưa có tab', () => {
  assert.deepEqual(loadTabs(mkStorage('{{{ không phải json')), []);
});

// Bản ghi thiếu id là bản ghi vô dụng (nối vào cũng không biết phiên nào) — bỏ, đừng giữ rác.
test('bỏ bản ghi thiếu id', () => {
  const s = mkStorage(JSON.stringify([{ label: 'mồ côi' }, { id: 'ok', label: 'term 1' }]));
  assert.deepEqual(loadTabs(s), [{ id: 'ok', label: 'term 1' }]);
});

test('lưu chỉ giữ id và label, không nuốt cả object session', () => {
  const s = mkStorage(undefined);
  saveTabs(s, [{ id: 'a1', label: 'term 1', term: {}, ws: {} }]);
  assert.deepEqual(JSON.parse(s.read()), [{ id: 'a1', label: 'term 1' }]);
});

test('id sinh ra phải khác nhau', () => {
  assert.notEqual(newSessionId(), newSessionId());
});
