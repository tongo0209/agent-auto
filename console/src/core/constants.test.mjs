import { test } from 'node:test';
import assert from 'node:assert';
import {
  PHASE,
  TASK_GROUPS,
  OFF_MY_PLATE_PHASES,
  DIM_PHASES,
  GONE_PHASES,
  DONE_PHASES,
  MILESTONE_LABEL,
} from './constants.mjs';

test('mọi phase trong vocab đều có nhãn tiếng Việt', () => {
  assert.equal(PHASE['reassigned'].label, 'đã chuyển người');
  assert.equal(PHASE['closed'].label, 'đóng');
});

test('nhóm "Đã xong / ra khỏi tay" gộp 3 phase và đóng sẵn', () => {
  const g = TASK_GROUPS.find((x) => x.label === 'Đã xong / ra khỏi tay');
  assert.deepEqual(g.phases, ['done-fe', 'reassigned', 'closed']);
  assert.equal(g.collapsed, true);
});

test('nhóm Chờ design tách 2 theo trạng thái tải design', () => {
  const labels = TASK_GROUPS.map((g) => g.label);
  assert.ok(labels.includes('Chờ design'));
  assert.ok(labels.includes('Design đã giao · chờ tải về'));
  const chua = TASK_GROUPS.find((g) => g.label === 'Design đã giao · chờ tải về');
  assert.equal(chua.where({ design: { status: 'đã-giao-chưa-tải' } }), true);
  // Mọi mức đã-giao-* khác "đã-tải" đều thuộc nhóm "chờ tải về" — kể cả mức thêm sau
  // (10/8: GW-627 design đã giao qua subtask Done mà suýt bị đọc thành "chờ design").
  assert.equal(chua.where({ design: { status: 'đã-giao-tải-một-phần' } }), true);
  assert.equal(chua.where({ design: { status: 'đã-giao-chờ-link' } }), true);
  assert.equal(chua.where({ design: { status: 'đã-giao-đã-tải' } }), false);
  const cho = TASK_GROUPS.find((g) => g.label === 'Chờ design');
  assert.equal(cho.where({ design: { status: 'chưa-có-link' } }), true);
  assert.equal(cho.where({}), true);
  assert.equal(cho.where({ design: { status: 'đã-giao-chờ-link' } }), false);
});

test('thứ tự nhóm: việc đang chạy trước, nhóm đóng sẵn cuối cùng', () => {
  const idx = TASK_GROUPS.findIndex((g) => g.collapsed);
  assert.equal(idx, TASK_GROUPS.length - 1);
});

test('cờ dẫn xuất', () => {
  assert.deepEqual([...OFF_MY_PLATE_PHASES].sort(), ['closed', 'reassigned']);
  // `closed` vào DIM từ 6/8: nó CÒN hàng trên timeline (để thấy mốc release của BE/QC) nên phải
  // mờ như done-fe. `reassigned` KHÔNG dim vì không được vẽ hàng nào cả — xem GONE_PHASES.
  assert.deepEqual(DIM_PHASES, ['done-fe', 'closed']);
  assert.deepEqual(GONE_PHASES, ['reassigned']);
  assert.deepEqual(DONE_PHASES, ['closed']);
  assert.equal(MILESTONE_LABEL.duedate, 'Due Jira');
});
