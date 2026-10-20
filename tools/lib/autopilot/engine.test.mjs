import { test } from 'node:test';
import assert from 'node:assert';
import { createRun, nextAction, applyEvent, resumeRun, roundOf, reopenRun, finalApproval, allowedActions, chooseAction } from './engine.mjs';

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

test('flow không khai budget → không giới hạn, tốn bao nhiêu cũng chạy tiếp', () => {
  const free = { ...FLOW, budget: undefined };
  const start = createRun({ key: 'GW-1', runId: 'r1', flow: free, routerReason: 'x', repo: '/r', campaignDir: '/r/c', now: T0 });
  const run = applyEvent(start, free, { type: 'pass', receipt: { ...receipt('plan', 500), ms: 600 * 60_000 } }, T0);
  assert.strictEqual(run.status, 'running');
  assert.deepStrictEqual(resumeRun({ ...run, status: 'stopped', stopReason: 'x' }, {}).budget, {});
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

test('resume run cũ còn trần budget (trước khi bỏ giới hạn) → chạy tiếp không giới hạn', () => {
  const run = applyEvent(fresh(), FLOW, { type: 'pass', receipt: receipt('plan', 11) }, T0);
  const resumed = resumeRun(run);
  assert.deepStrictEqual(resumed.budget, {});
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

const REVIEW_FLOW = {
  id: 'rv',
  stages: [
    { id: 'gates', kind: 'gate', loop: { back: 'fix', max: 2 }, next: 'gates-final' },
    { id: 'gates-final', kind: 'gate', loop: { back: 'fix', max: 2 }, next: 'result' },
    { id: 'fix', kind: 'claude', returnTo: 'caller' },
    { id: 'result', kind: 'pause', onReject: 'fix', rejectReturnTo: 'gates-final', next: 'commit' },
    { id: 'commit', kind: 'gate', checks: ['commit'], next: null },
  ],
};

test('finalApproval = mốc duyệt ngay trước stage commit', () => {
  assert.strictEqual(finalApproval(REVIEW_FLOW).id, 'result');
  assert.strictEqual(finalApproval(FLOW), undefined);
});

test('reopenRun: run done bị trả về sau review → fix với note, quay về gate cuối, vòng lặp đếm lại', () => {
  const done = { ...createRun({ key: 'K', runId: 'r', flow: REVIEW_FLOW, repo: '/r', campaignDir: '/c', now: T0 }), status: 'done', stage: null, loops: { 'gates-final': 2 }, reviewedAt: T0 };
  const run = reopenRun(done, REVIEW_FLOW, 'nút lệch 4px', T0 + 1);
  assert.deepStrictEqual([run.status, run.stage, run.callerOfFix, run.rejectNote], ['running', 'fix', 'gates-final', 'nút lệch 4px']);
  assert.deepStrictEqual([run.reviewedAt, run.reopenedAt, run.loops], [null, T0 + 1, {}]);
  const back = applyEvent(run, REVIEW_FLOW, { type: 'pass' }, T0);
  assert.strictEqual(back.stage, 'gates-final');
});

const PICK_FLOW = {
  id: 'pick', budget: {},
  stages: [
    { id: 'plan', kind: 'claude', next: 'approve-plan' },
    { id: 'approve-plan', kind: 'pause', next: 'implement' },
    { id: 'implement', kind: 'claude', next: 'gates' },
    { id: 'gates', kind: 'gate', next: null },
  ],
};
const OPTS = [{ id: 'A', title: 'Một' }, { id: 'B', title: 'Hai' }];
const types = (actions) => actions.map((a) => a.type);
const ofType = (actions, type) => actions.find((a) => a.type === type);

function stoppedAtGates() {
  let run = fresh();
  for (let i = 0; i < 2; i++) run = step(run, 'pass');
  run = applyEvent(run, FLOW, { type: 'approve' }, T0);
  for (let i = 0; i < 2; i++) run = step(run, 'pass');
  return { ...run, status: 'stopped', stopReason: 'fail:gates', loops: { implement: 1, review: 2, gates: 1 }, sessions: { implement: 's1' } };
}

test('allowedActions: running chỉ có break', () => {
  assert.deepStrictEqual(types(allowedActions(fresh(), FLOW)), ['break']);
});

test('allowedActions: stopped ở gates có retry, skip needsReason=true, goto [plan, plan-review, implement, review]', () => {
  const actions = allowedActions(stoppedAtGates(), FLOW);
  assert.ok(ofType(actions, 'retry'));
  assert.strictEqual(ofType(actions, 'skip').needsReason, true);
  assert.deepStrictEqual(ofType(actions, 'goto').stages, ['plan', 'plan-review', 'implement', 'review']);
});

test('allowedActions: approve-plan có 2 phương án → pick [A,B]; 1 phương án → không có pick', () => {
  const run = applyEvent(createRun({ key: 'K', runId: 'r', flow: PICK_FLOW, repo: '/r', campaignDir: '/c', now: T0 }), PICK_FLOW, { type: 'pass' }, T0);
  assert.deepStrictEqual(ofType(allowedActions(run, PICK_FLOW, { options: OPTS }), 'pick').options, ['A', 'B']);
  assert.strictEqual(ofType(allowedActions(run, PICK_FLOW, { options: OPTS.slice(0, 1) }), 'pick'), undefined);
});

test('chooseAction retry: reset loop + xoá session, status running', () => {
  const run = chooseAction(stoppedAtGates(), FLOW, { type: 'retry', note: 'thử lại' }, { now: T0 });
  assert.deepStrictEqual([run.status, run.stopReason, run.stage, run.loops.gates, run.rejectNote], ['running', null, 'gates', 0, 'thử lại']);
  assert.strictEqual(run.sessions.implement, 's1');
  assert.strictEqual(chooseAction({ ...stoppedAtGates(), sessions: { gates: 'g' } }, FLOW, { type: 'retry' }, { now: T0 }).sessions.gates, undefined);
});

test('chooseAction goto implement: xoá sessions.implement, loops từ implement trở đi về 0', () => {
  const run = chooseAction(stoppedAtGates(), FLOW, { type: 'goto', stage: 'implement', note: 'làm lại' }, { now: T0 });
  assert.deepStrictEqual([run.stage, run.status, run.rejectNote], ['implement', 'running', 'làm lại']);
  assert.strictEqual(run.sessions.implement, undefined);
  assert.deepStrictEqual([run.loops.implement, run.loops.review, run.loops.gates].map((n) => n ?? 0), [0, 0, 0]);
});

test('chooseAction goto plan: choice về null', () => {
  const run = chooseAction({ ...stoppedAtGates(), choice: { id: 'A', title: 'x', note: null } }, FLOW, { type: 'goto', stage: 'plan' }, { now: T0 });
  assert.strictEqual(run.choice, null);
});

test('chooseAction goto stage chưa qua → ném "chưa đi qua"', () => {
  assert.throws(() => chooseAction(stoppedAtGates(), FLOW, { type: 'goto', stage: 'final' }, { now: T0 }), /chưa đi qua/);
});

test('chooseAction skip gates thiếu reason → ném "cần lý do"; có reason → gateSkipped, receipt skipped-by-user, stage = next', () => {
  assert.throws(() => chooseAction(stoppedAtGates(), FLOW, { type: 'skip' }, { now: T0 }), /cần lý do/);
  const run = chooseAction(stoppedAtGates(), FLOW, { type: 'skip', reason: 'QC chấp nhận' }, { now: T0 });
  assert.strictEqual(run.gateSkipped.length, 1);
  assert.deepStrictEqual([run.gateSkipped[0].stage, run.gateSkipped[0].reason], ['gates', 'QC chấp nhận']);
  const last = run.receipts.at(-1);
  assert.deepStrictEqual([last.stage, last.verdict, last.note], ['gates', 'skipped-by-user', 'QC chấp nhận']);
  assert.deepStrictEqual([run.stage, run.status], ['design-gap-check', 'running']);
});

test('applyEvent skip không by:user giữ nguyên: không gateSkipped', () => {
  let run = { ...fresh(), stage: 'gates' };
  run = applyEvent(run, FLOW, { type: 'skip' }, T0);
  assert.deepStrictEqual(run.gateSkipped, []);
});

test('chooseAction pick A → choice.id A, stage = implement', () => {
  const run = applyEvent(createRun({ key: 'K', runId: 'r', flow: PICK_FLOW, repo: '/r', campaignDir: '/c', now: T0 }), PICK_FLOW, { type: 'pass' }, T0);
  const picked = chooseAction(run, PICK_FLOW, { type: 'pick', option: 'A', note: 'ok' }, { options: OPTS, now: T0 });
  assert.deepStrictEqual(picked.choice, { id: 'A', title: 'Một', note: 'ok' });
  assert.strictEqual(picked.stage, 'implement');
});

test('chooseAction pick khi không có phương án → ném', () => {
  const run = applyEvent(createRun({ key: 'K', runId: 'r', flow: PICK_FLOW, repo: '/r', campaignDir: '/c', now: T0 }), PICK_FLOW, { type: 'pass' }, T0);
  assert.throws(() => chooseAction(run, PICK_FLOW, { type: 'pick', option: 'A' }, { options: [], now: T0 }));
});

test('chooseAction break: toggle breakpoint, không đổi status', () => {
  const once = chooseAction(fresh(), FLOW, { type: 'break', stage: 'gates' }, { now: T0 });
  assert.deepStrictEqual([once.plan.breakpoints, once.status], [['gates'], 'running']);
  assert.deepStrictEqual(chooseAction(once, FLOW, { type: 'break', stage: 'gates' }, { now: T0 }).plan.breakpoints, []);
});

test('chooseAction trên run running (không break) → ném "đang chạy"', () => {
  assert.throws(() => chooseAction(fresh(), FLOW, { type: 'retry' }, { now: T0 }), /đang chạy/);
});

test('createRun thiếu disabled/breakpoints → plan {disabled:[],breakpoints:[]}, choice null, gateSkipped []', () => {
  const run = fresh();
  assert.deepStrictEqual(run.plan, { disabled: [], breakpoints: [], skipReason: null });
  assert.strictEqual(run.choice, null);
  assert.deepStrictEqual(run.gateSkipped, []);
});
