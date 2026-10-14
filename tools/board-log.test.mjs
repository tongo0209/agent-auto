import { test } from 'node:test';
import assert from 'node:assert';
import { appendLog, newBoard } from './board-log.mjs';

const BOARD = `# Board 2026-10-14

## Log
- 10:22 — psd-cut PASS
- 10:12 — prep xong

## Cần bạn
- [ ] duyệt kế hoạch
`;

test('chèn cuối mục Log, trước mục Cần bạn', () => {
  const { text, skipped } = appendLog(BOARD, 'build xong', '11:05');
  assert.equal(skipped, false);
  assert.equal(text, BOARD.replace('- 10:12 — prep xong\n', '- 10:12 — prep xong\n- 11:05 — build xong\n'));
});

test('bỏ qua khi sự kiện đã có y hệt trong Log, khác giờ cũng vậy', () => {
  const { text, skipped } = appendLog(BOARD, 'prep xong', '15:00');
  assert.equal(skipped, true);
  assert.equal(text, BOARD);
});

test('board không có mục Log thì thêm mục Log cuối file', () => {
  const { text } = appendLog('# Board 2026-10-14\n\n## Cần bạn\n- [ ] x\n', 'mở phiên', '09:00');
  assert.equal(text, '# Board 2026-10-14\n\n## Cần bạn\n- [ ] x\n\n## Log\n- 09:00 — mở phiên\n');
});

test('board mới có khung tiêu đề + Log + Cần bạn, dòng log nằm trong Log', () => {
  const { text } = appendLog(newBoard('2026-10-15'), 'mở phiên', '08:30');
  assert.equal(text, '# Board 2026-10-15\n\n## Log\n- 08:30 — mở phiên\n\n## Cần bạn\n');
});

test('sự kiện rỗng thì ném lỗi', () => {
  assert.throws(() => appendLog(BOARD, '   ', '11:00'), /rỗng/);
});
