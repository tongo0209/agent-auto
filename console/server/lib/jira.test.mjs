import { test } from 'node:test';
import assert from 'node:assert';
import jira from './jira.js';

const { pickDoneTransition, basicAuth } = jira;

const T = (id, name, toName, categoryKey) => ({
  id,
  name,
  to: { name: toName, statusCategory: { key: categoryKey } },
});

test('chọn transition tới COMPLETED — đúng trạng thái đóng của project GW', () => {
  const t = pickDoneTransition([
    T('11', 'In Progress', 'IN PROGRESS', 'indeterminate'),
    T('31', 'Complete', 'COMPLETED', 'done'),
  ]);
  assert.equal(t.id, '31');
});

test('project chỉ có "Done" thì lấy Done', () => {
  const t = pickDoneTransition([T('21', 'Done', 'Done', 'done')]);
  assert.equal(t.id, '21');
});

test('KHÔNG chọn nhánh huỷ dù nó cũng thuộc nhóm done', () => {
  // "Won't Do" / "Cancelled" cũng là statusCategory done — đánh nhầm là báo cáo sai việc đã làm.
  const t = pickDoneTransition([
    T('41', "Won't Do", "WON'T DO", 'done'),
    T('42', 'Cancelled', 'CANCELLED', 'done'),
    T('31', 'Complete', 'COMPLETED', 'done'),
  ]);
  assert.equal(t.id, '31');
});

test('chỉ còn nhánh huỷ → trả null, KHÔNG tự chọn bừa', () => {
  const t = pickDoneTransition([T('41', "Won't Do", "WON'T DO", 'done')]);
  assert.equal(t, null);
});

test('transition tên "Done" nhưng status không thuộc nhóm done → bỏ qua', () => {
  const t = pickDoneTransition([T('99', 'Done', 'READY FOR QC', 'indeterminate')]);
  assert.equal(t, null);
});

test('danh sách rỗng / hỏng → null', () => {
  assert.equal(pickDoneTransition([]), null);
  assert.equal(pickDoneTransition(null), null);
});

test('dữ liệu THẬT của project GW: chọn COMPLETED (31), né Canceled (3)', () => {
  // Lấy nguyên từ Jira GW-525 qua MCP ngày 10/08/2026. Workflow của GW có "Canceled" cũng nằm
  // trong statusCategory done — đây chính là ca sẽ báo cáo sai nếu chỉ lọc theo category.
  const real = [
    T('3', 'Canceled', 'Canceled', 'done'),
    T('4', 'Pending', 'Pending', 'indeterminate'),
    T('11', 'planned', 'planned', 'new'),
    T('21', 'In Progress', 'In Progress', 'indeterminate'),
    T('31', 'COMPLETED', 'COMPLETED', 'done'),
    T('41', 'Blocked', 'Blocked', 'new'),
  ];
  assert.equal(pickDoneTransition(real).id, '31');
});

test('basicAuth dựng đúng header REST v3', () => {
  assert.equal(basicAuth('a@b.com', 'tok'), 'Basic ' + Buffer.from('a@b.com:tok').toString('base64'));
});
