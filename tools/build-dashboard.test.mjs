import { test } from 'node:test';
import assert from 'node:assert';
import { buildBoardData } from './build-dashboard.mjs';
import vocab from '../schema/vocab.json' with { type: 'json' };

const TODAY = '2026-08-03';
const state = {
  issues: {
    'GW-1': { phase: 'coding', summary: 'A', milestones: { html: '2026-08-07', duedate: '2026-08-05' } },
    'GW-2': { phase: 'reassigned', summary: 'B', milestones: { html: '2026-08-05' } },
    'GW-3': { phase: 'waiting-design', summary: 'C', milestones: { design: '2026-08-10' } },
  },
};
const boardMd = '## Cần bạn\n\n- [ ] GW-1 — cắt 30 ảnh\n- [x] ~~xong rồi~~\n';

test('ticket đã chuyển người KHÔNG vào dashboard', () => {
  const d = buildBoardData({ state, boardMd, today: TODAY, vocab });
  assert.deepEqual(d.tasks.map((t) => t.key), ['GW-1', 'GW-3']);
});

test('dải mốc chỉ lấy mốc phải giao trong 14 ngày', () => {
  const d = buildBoardData({ state, boardMd, today: TODAY, vocab });
  assert.deepEqual(d.week.map((w) => `${w.key}:${w.name}`), ['GW-1:html', 'GW-3:design']);
});

test('mục Cần bạn: bỏ dòng đã tick', () => {
  const d = buildBoardData({ state, boardMd, today: TODAY, vocab });
  assert.deepEqual(d.todos, ['GW-1 — cắt 30 ảnh']);
});

test('status của thẻ suy từ vocab, không hardcode', () => {
  const d = buildBoardData({ state, boardMd, today: TODAY, vocab });
  assert.equal(d.tasks.find((t) => t.key === 'GW-1').status, 'running');
  assert.equal(d.tasks.find((t) => t.key === 'GW-3').status, 'waiting');
});
