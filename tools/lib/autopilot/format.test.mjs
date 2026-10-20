import { test } from 'node:test';
import assert from 'node:assert';
import { formatStatus, stageCells, totals } from './format.mjs';

const flow = { id: 'f', stages: [
  { id: 'plan', kind: 'claude', next: 'review' },
  { id: 'review', kind: 'claude', next: 'ok' },
  { id: 'ok', kind: 'pause', next: 'commit' },
  { id: 'commit', kind: 'gate', next: null },
] };
const run = {
  key: 'GW-1', runId: 'r1', flow: 'f', status: 'paused', stage: 'ok', stopReason: null, routerReason: 'landing-fix: hasDesign',
  receipts: [
    { stage: 'plan', round: 1, verdict: 'pass', blocking: 0, advisory: 0, turns: 69, costUsd: 2.73, ms: 420000 },
    { stage: 'review', round: 1, verdict: 'revise', blocking: 1, advisory: 4, turns: 41, costUsd: 1.32, ms: 120000 },
    { stage: 'review', round: 2, verdict: 'pass', blocking: 0, advisory: 0, turns: 2, costUsd: 0.12, ms: 60000 },
  ],
};

test('stageCells: done / waiting / pending', () => {
  assert.deepStrictEqual(stageCells(run, flow).map((c) => [c.id, c.state]), [['plan', 'done'], ['review', 'done'], ['ok', 'waiting'], ['commit', 'pending']]);
  assert.strictEqual(stageCells(run, flow)[1].rounds, 2);
});

test('stageCells: stage đang dừng → stopped, đang chạy → running', () => {
  assert.strictEqual(stageCells({ ...run, status: 'stopped', stage: 'review' }, flow)[1].state, 'stopped');
  assert.strictEqual(stageCells({ ...run, status: 'running', stage: 'review' }, flow)[1].state, 'running');
});

test('stageCells: mốc duyệt đã qua (stage sau đã chạy) → done', () => {
  const past = { ...run, status: 'running', stage: 'commit', receipts: [...run.receipts, { stage: 'commit', round: 1, verdict: 'pass', blocking: 0, advisory: 0, turns: 0, costUsd: 0, ms: 1000 }] };
  assert.strictEqual(stageCells(past, flow)[2].state, 'done');
});

test('totals cộng token tiêu hao, receipt cũ không có token tính 0', () => {
  const withTokens = { ...run, receipts: [...run.receipts, { stage: 'plan', verdict: 'pass', blocking: 0, advisory: 0, turns: 1, costUsd: 0, ms: 0, tokens: 1500 }] };
  assert.strictEqual(totals(withTokens).tokens, 1500);
});

test('totals cộng turns, phút, $', () => {
  assert.deepStrictEqual(totals(run), { runs: 3, turns: 112, minutes: 10, usd: 4.17, tokens: 0 });
});

test('formatStatus có hàng stage, dòng round và dòng tổng', () => {
  const out = formatStatus(run, flow);
  assert.match(out, /✓ plan → ✓ review → ⏸ ok → · commit/);
  assert.match(out, /review · r1 · revise · 1 blocking · 4 advisory · 41 turns · 2 phút · \$1\.32/);
  assert.match(out, /Tổng: 3 lượt claude · 10 phút · \$4\.17/);
});

test('stageCells: run chat lấy trạng thái bước hiện tại từ mark (ask → waiting, doing → running)', () => {
  const chat = { ...run, status: 'chat', stage: 'review' };
  assert.strictEqual(stageCells({ ...chat, chatState: 'ask' }, flow)[1].state, 'waiting');
  assert.strictEqual(stageCells({ ...chat, chatState: 'doing' }, flow)[1].state, 'running');
  assert.strictEqual(stageCells({ ...chat, chatState: null }, flow)[1].state, 'pending');
});

test('stageCells: bước bị bỏ qua (bước sau đã chạy hoặc run xong) → skipped, không xám như chưa chạy', () => {
  const doneRun = { ...run, status: 'done', stage: null, receipts: [run.receipts[0], { stage: 'commit', round: 1, verdict: 'pass', blocking: 0, advisory: 0, turns: 0, costUsd: 0, ms: 1000 }] };
  assert.deepStrictEqual(stageCells(doneRun, flow).map((c) => c.state), ['done', 'skipped', 'done', 'done']);
});
