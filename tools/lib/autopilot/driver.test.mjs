import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-drive-'));
const { drive } = await import('./driver.mjs');
const { createRun, applyEvent } = await import('./engine.mjs');
const { loadFlow } = await import('./flows.mjs');
const { runDir, loadRun } = await import('./store.mjs');

const verdict = (v, extra = {}) => '```autopilot-verdict\n' + JSON.stringify({ verdict: v, ...extra }) + '\n```';

function fakeClaude(script) {
  const calls = [];
  const runClaude = async (opts) => {
    calls.push(opts);
    const list = script[opts.stageId] ?? [{ result: verdict('pass') }];
    const entry = list[opts.round - 1] ?? list.at(-1);
    return { ok: entry.ok ?? true, sessionId: `s-${opts.stageId}`, turns: 2, costUsd: entry.costUsd ?? 0.1, ms: 1000, result: entry.result ?? verdict('pass'), error: entry.ok === false ? 'boom' : null };
  };
  return { runClaude, calls };
}

function fakeGates(byRound = {}) {
  const calls = [];
  const runGates = async (checks, ctx) => {
    calls.push({ checks, ctx });
    const fail = (byRound[checks.join(',')] ?? [])[calls.filter((c) => c.checks.join(',') === checks.join(',')).length - 1];
    if (fail === 'error') return { pass: false, error: checks[0], results: [{ check: checks[0], status: 'error', blocking: [], note: 'x' }] };
    return { pass: !fail, error: null, results: [{ check: checks[0], status: fail ? 'fail' : 'pass', blocking: fail ? ['lỗi build'] : [], note: '' }] };
  };
  return { runGates, calls };
}

const notified = [];
const base = (extra = {}) => ({ now: () => Date.now(), notify: (t, m) => notified.push(m), ...extra });
const newRun = (flowId) =>
  createRun({ key: 'GW-1', runId: `r${Math.random().toString(36).slice(2, 8)}`, flow: loadFlow(flowId), routerReason: 't', repo: '/repo', campaignDir: '/repo/products/x/landing/a', now: Date.now() });

beforeEach(() => (notified.length = 0));

test('landing-fix: chạy tới pause duyệt plan, ghi artifact + receipt', async () => {
  const { runClaude, calls } = fakeClaude({});
  const run = await drive(newRun('landing-fix'), loadFlow('landing-fix'), base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'approve-plan']);
  assert.deepStrictEqual(calls.map((c) => c.stageId), ['plan', 'plan-review']);
  assert.match(calls[0].prompt, /^AUTOPILOT_RUN: GW-1\//);
  assert.ok(fs.existsSync(path.join(runDir(run.key, run.runId), 'plan-review-r1.json')));
  assert.strictEqual(run.receipts.length, 2);
  assert.match(notified.at(-1), /approve GW-1/);
  assert.deepStrictEqual(loadRun(run.key, run.runId), run);
});

test('approve → code → gates đỏ → fix resume phiên implement, nạp feedback → done', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({ implement: [{ result: verdict('pass', { files: ['products/x/landing/a/index.html'] }) }] });
  const gates = fakeGates({ 'build,pm-gate,fe-gate,landing-parity,layout-gate': [true] });
  let run = await drive(newRun('landing-fix'), flow, base({ runClaude, runGates: gates.runGates }));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, base({ runClaude, runGates: gates.runGates }));
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'approve-result']);

  const fix = calls.find((c) => c.stageId === 'fix');
  assert.strictEqual(fix.resumeSessionId, 's-implement');
  assert.match(fix.prompt, /gates-r1\.json/);
  assert.deepStrictEqual(run.files, ['products/x/landing/a/index.html']);

  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, base({ runClaude, runGates: gates.runGates }));
  assert.strictEqual(run.status, 'done');
  const commitCall = gates.calls.at(-1);
  assert.deepStrictEqual(commitCall.checks, ['commit']);
  assert.deepStrictEqual(commitCall.ctx.files, ['products/x/landing/a/index.html']);
});

test('runner lỗi 2 lần → stopped runner:<stage>', async () => {
  const { runClaude, calls } = fakeClaude({ plan: [{ ok: false }] });
  const run = await drive(newRun('landing-fix'), loadFlow('landing-fix'), base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([run.status, run.stopReason], ['stopped', 'runner:plan']);
  assert.strictEqual(calls.length, 2);
  assert.match(notified.at(-1), /runner:plan/);
});

test('output không verdict mà có mã hook G- → stopped guard', async () => {
  const { runClaude } = fakeClaude({ plan: [{ result: 'bị chặn G-GIT-4' }] });
  const run = await drive(newRun('landing-fix'), loadFlow('landing-fix'), base({ runClaude, runGates: fakeGates().runGates }));
  assert.strictEqual(run.stopReason, 'guard:G-GIT-4');
});

test('gate error → stopped gate-error:<check>', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude } = fakeClaude({});
  let run = await drive(newRun('landing-fix'), flow, base({ runClaude, runGates: fakeGates().runGates }));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, base({ runClaude, runGates: fakeGates({ 'build,pm-gate,fe-gate,landing-parity,layout-gate': ['error'] }).runGates }));
  assert.strictEqual(run.stopReason, 'gate-error:build');
});

test('feature: ui-check bị bỏ khi không chạm file giao diện', async () => {
  const flow = loadFlow('feature');
  const { runClaude, calls } = fakeClaude({ implement: [{ result: verdict('pass', { files: ['src/api.js'] }) }] });
  let run = await drive(newRun('feature'), flow, base({ runClaude, runGates: fakeGates().runGates }));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.strictEqual(run.stage, 'approve-result');
  assert.ok(!calls.some((c) => c.stageId === 'ui-check'));
});

test('buglist: intake báo campaignDir thì run nhận campaign', async () => {
  const flow = loadFlow('buglist');
  const start = { ...newRun('buglist'), campaignDir: null, repo: null };
  const { runClaude } = fakeClaude({ 'intake-triage': [{ result: verdict('pass', { campaignDir: '/repo/products/y/landing/b' }) }] });
  const run = await drive(start, flow, base({ runClaude, runGates: fakeGates().runGates, repoOf: () => '/repo' }));
  assert.deepStrictEqual([run.campaignDir, run.repo, run.stage], ['/repo/products/y/landing/b', '/repo', 'approve-result']);
});
