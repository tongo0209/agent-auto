import { test } from 'node:test';
import assert from 'node:assert';
import { formatStatus, parseOptions, stageCells, totals } from './format.mjs';

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

const planMd = (opts) => `# Plan\n\n## Bối cảnh\nx\n\n## Phương án\n${opts}\n## Việc cần làm\n- a\n`;

test('parseOptions: 3 phương án → id [A,B,C], title đúng, body không chứa heading kế', () => {
  const out = parseOptions(planMd('### A · Sửa CSS\nđổi grid\n\n### B · Viết lại\nlàm mới\n\n### C · Giữ nguyên\nkhông đổi\n'));
  assert.deepStrictEqual(out.map((o) => [o.id, o.title]), [['A', 'Sửa CSS'], ['B', 'Viết lại'], ['C', 'Giữ nguyên']]);
  assert.strictEqual(out[0].body, 'đổi grid');
  assert.ok(!out[2].body.includes('##'));
});

test('parseOptions: 1 phương án → 1 phần tử', () => {
  assert.strictEqual(parseOptions(planMd('### A · Duy nhất\nbody\n')).length, 1);
});

test('parseOptions: không có mục → []', () => {
  assert.deepStrictEqual(parseOptions('# Plan\n\n## Bối cảnh\nx\n'), []);
});

test('stageCells: stage bị user bỏ → state skipped, skippedReason "QC chưa cần"', () => {
  const skipped = { ...run, status: 'running', stage: 'commit', receipts: [...run.receipts, { stage: 'ok', verdict: 'skipped-by-user', note: 'QC chưa cần', blocking: 0, advisory: 0, turns: 0, costUsd: 0, ms: 0 }] };
  const cells = stageCells(skipped, flow);
  assert.deepStrictEqual([cells[2].state, cells[2].skippedReason, cells[1].skippedReason], ['skipped', 'QC chưa cần', null]);
});

test('stageCells: breakpoint đánh dấu đúng ô', () => {
  const bp = { ...run, plan: { breakpoints: ['review'] } };
  assert.deepStrictEqual(stageCells(bp, flow).map((c) => c.breakpoint), [false, true, false, false]);
  assert.ok(stageCells(run, flow).every((c) => c.breakpoint === false));
});
