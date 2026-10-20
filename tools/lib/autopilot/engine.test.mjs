import { test } from 'node:test';
import assert from 'node:assert';
import { createRun, nextAction, applyEvent, resumeRun, roundOf } from './engine.mjs';

const FLOW = {
  id: 'mini',
  budget: { usd: 10, minutes: 60 },
  stages: [
    { id: 'plan', kind: 'claude', next: 'plan-review' },
    { id: 'plan-review', kind: 'claude', loop: { back: 'plan', max: 2 }, next: 'approve' },
    { id: 'approve', kind: 'pause', onReject: 'plan', next: 'implement' },
    { id: 'implement', kind: 'claude', keepSession: true, next: 'review' },
    { id: 'review', kind: 'claude', loop: { back: 'fix', max: 2 }, next: 'gates' },
    { id: 'gates', kind: 'gate', loop: { back: 'fix', max: 2 }, next: 'design-gap-check' },
    { id: 'design-gap-check', kind: 'claude', onRevise: 'gap', next: 'final' },
    { id: 'gap', kind: 'pause', next: 'final' },
    { id: 'fix', kind: 'claude', resume: 'implement', returnTo: 'caller' },
    { id: 'final', kind: 'pause', next: null },
  ],
};

const T0 = Date.parse('2026-10-20T10:00:00+07:00');
const fresh = () => createRun({ key: 'GW-1', runId: 'r1', flow: FLOW, routerReason: 'x', repo: '/r', campaignDir: '/r/c', now: T0 });
const receipt = (stage, costUsd = 0.1) => ({ stage, verdict: 'pass', blocking: 0, advisory: 0, turns: 3, costUsd, ms: 1000 });
const step = (run, type, extra = {}, now = T0) => applyEvent(run, FLOW, { type, receipt: receipt(run.stage), ...extra }, now);

test('createRun bắt đầu ở stage đầu, running', () => {
  const run = fresh();
  assert.strictEqual(run.stage, 'plan');
  assert.strictEqual(run.status, 'running');
  assert.deepStrictEqual(nextAction(run, FLOW), { type: 'claude', stage: FLOW.stages[0] });
});

test('đi thẳng tới done', () => {
  let run = fresh();
  run = step(run, 'pass');
  run = step(run, 'pass');
  assert.strictEqual(run.status, 'paused');
  for (const t of ['approve', 'pass', 'pass', 'pass', 'pass']) run = step(run, t);
  assert.strictEqual(run.stage, 'final');
  run = step(run, 'approve');
  assert.strictEqual(run.status, 'done');
  assert.strictEqual(nextAction(run, FLOW).type, 'done');
});

test('revise quá max → loop-exhausted', () => {
  let run = step(fresh(), 'pass');
  for (let i = 0; i < 2; i++) run = step(step(run, 'revise'), 'pass');
  assert.strictEqual(run.stage, 'plan-review');
  run = step(run, 'revise');
  assert.strictEqual(run.status, 'stopped');
  assert.strictEqual(run.stopReason, 'loop-exhausted:plan-review');
});

test('reject ghi note và về onReject', () => {
  let run = step(step(fresh(), 'pass'), 'pass');
  run = applyEvent(run, FLOW, { type: 'reject', note: 'thiếu tab' }, T0);
  assert.strictEqual(run.stage, 'plan');
  assert.strictEqual(run.rejectNote, 'thiếu tab');
  assert.strictEqual(run.status, 'running');
});

test('fix quay về đúng caller khi xen kẽ', () => {
  let run = step(step(fresh(), 'pass'), 'pass');
  run = step(step(run, 'approve'), 'pass');
  run = step(run, 'revise', { receipt: { ...receipt('review'), blocking: 1 } });
  assert.strictEqual(run.stage, 'fix');
  run = step(run, 'pass');
  assert.strictEqual(run.stage, 'review');
  run = step(run, 'pass');
  run = step(run, 'revise');
  assert.strictEqual(run.stage, 'fix');
  assert.strictEqual(run.callerOfFix, 'gates');
  run = step(run, 'pass');
  assert.strictEqual(run.stage, 'gates');
  assert.strictEqual(run.callerOfFix, null);
});

test('fail ở stage không loop → stopped fail:<id>', () => {
  const run = step(fresh(), 'fail');
  assert.strictEqual(run.status, 'stopped');
  assert.strictEqual(run.stopReason, 'fail:plan');
});

test('fail ở stage có loop tính 1 vòng', () => {
  const run = step(step(fresh(), 'pass'), 'fail');
  assert.strictEqual(run.stage, 'plan');
  assert.strictEqual(run.loops['plan-review'], 1);
});

test('vượt budget usd → stopped budget', () => {
  const run = applyEvent(fresh(), FLOW, { type: 'pass', receipt: receipt('plan', 11) }, T0);
  assert.strictEqual(run.stopReason, 'budget');
});

test('vượt budget phút (máy chạy) → stopped budget', () => {
  const run = applyEvent(fresh(), FLOW, { type: 'pass', receipt: { ...receipt('plan'), ms: 61 * 60_000 } }, T0);
  assert.strictEqual(run.stopReason, 'budget');
});

test('thời gian chờ người duyệt không tính vào budget phút', () => {
  let run = step(step(fresh(), 'pass'), 'pass');
  run = applyEvent(run, FLOW, { type: 'approve' }, T0 + 121 * 60_000);
  assert.deepStrictEqual([run.status, run.stage], ['running', 'implement']);
});

test('resume sau budget tự nới 1.5× giới hạn khi không truyền budget mới', () => {
  const run = applyEvent(fresh(), FLOW, { type: 'pass', receipt: receipt('plan', 11) }, T0);
  const resumed = resumeRun(run);
  assert.deepStrictEqual(resumed.budget, { usd: 15, minutes: 90 });
  assert.strictEqual(applyEvent(resumed, FLOW, { type: 'pass', receipt: receipt('plan-review') }, T0).status, 'paused');
});

test('keepSession lưu sessionId', () => {
  let run = step(step(fresh(), 'pass'), 'pass');
  run = step(run, 'approve');
  run = step(run, 'pass', { sessionId: 'abc' });
  assert.strictEqual(run.sessions.implement, 'abc');
});

test('resume sau loop-exhausted reset vòng, đổi budget', () => {
  let run = step(fresh(), 'pass');
  for (let i = 0; i < 3; i++) run = run.status === 'stopped' ? run : step(step(run, 'revise'), 'pass');
  run = step(run, 'revise');
  assert.strictEqual(run.status, 'stopped');
  const resumed = resumeRun(run, { budgetUsd: 50 });
  assert.strictEqual(resumed.status, 'running');
  assert.strictEqual(resumed.loops['plan-review'], 0);
  assert.strictEqual(resumed.budget.usd, 50);
});

test('onRevise rẽ sang pause', () => {
  let run = { ...fresh(), stage: 'design-gap-check' };
  run = step(run, 'revise');
  assert.strictEqual(run.stage, 'gap');
  assert.strictEqual(run.status, 'paused');
});

test('applyEvent không mutate input, roundOf đếm receipt', () => {
  const run = fresh();
  const snapshot = JSON.stringify(run);
  const next = step(run, 'pass');
  assert.strictEqual(JSON.stringify(run), snapshot);
  assert.strictEqual(roundOf(next, 'plan'), 2);
  assert.strictEqual(roundOf(next, 'plan-review'), 1);
});

test('reject ở pause sang fix → fix xong quay về rejectReturnTo', () => {
  const flow = {
    id: 'r', budget: { usd: 10, minutes: 60 },
    stages: [
      { id: 'gates', kind: 'gate', next: 'result' },
      { id: 'fix', kind: 'claude', returnTo: 'caller' },
      { id: 'result', kind: 'pause', onReject: 'fix', rejectReturnTo: 'gates', next: null },
    ],
  };
  let run = createRun({ key: 'K', runId: 'r', flow, repo: '/r', campaignDir: '/c', now: T0 });
  run = applyEvent(run, flow, { type: 'pass' }, T0);
  run = applyEvent(run, flow, { type: 'reject', note: 'lệch 4px' }, T0);
  assert.deepStrictEqual([run.stage, run.callerOfFix], ['fix', 'gates']);
  run = applyEvent(run, flow, { type: 'pass' }, T0);
  assert.strictEqual(run.stage, 'gates');
});

test('halt dừng run với lý do, vẫn ghi receipt', () => {
  const run = applyEvent(fresh(), FLOW, { type: 'halt', reason: 'runner:plan', receipt: receipt('plan') }, T0);
  assert.deepStrictEqual([run.status, run.stopReason, run.receipts.length], ['stopped', 'runner:plan', 1]);
});
