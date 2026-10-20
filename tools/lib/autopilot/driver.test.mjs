import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-drive-'));
const { drive } = await import('./driver.mjs');
const { createRun, applyEvent, resumeRun } = await import('./engine.mjs');
const { loadFlow } = await import('./flows.mjs');
const { runDir, loadRun, saveRun, pauseFile } = await import('./store.mjs');
const { holdCampaign, heldCampaigns } = await import('./lock.mjs');

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
const fakeWorktree = ({ repo, parentDir }) => ({ top: repo, dir: path.join(parentDir, path.basename(repo)) });
const base = (extra = {}) => ({ now: () => Date.now(), notify: (t, m) => notified.push(m), addWorktree: fakeWorktree, ...extra });
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

test('abort từ process khác giữa chừng → driver dừng, không ghi đè aborted', async () => {
  const start = newRun('landing-fix');
  const runClaude = async (opts) => {
    if (opts.stageId === 'plan') saveRun({ ...loadRun(start.key, start.runId) ?? start, status: 'stopped', stopReason: 'aborted' });
    return { ok: true, sessionId: 's', turns: 1, costUsd: 0.1, ms: 10, result: verdict('pass'), error: null };
  };
  const run = await drive(start, loadFlow('landing-fix'), base({ runClaude, runGates: fakeGates().runGates }));
  assert.strictEqual(run.stopReason, 'aborted');
  assert.strictEqual(loadRun(start.key, start.runId).stopReason, 'aborted');
});

test('campaign biết giữa chừng: được giữ; đang bị run khác giữ → stopped', async () => {
  const flow = loadFlow('buglist');
  const dirA = `/repo/products/y/landing/${Math.random()}`;
  const { runClaude } = fakeClaude({ 'intake-triage': [{ result: verdict('pass', { campaignDir: dirA }) }] });
  const a = await drive({ ...newRun('buglist'), key: 'GW-31', campaignDir: null, repo: null }, flow, base({ runClaude, runGates: fakeGates().runGates, repoOf: () => '/repo' }));
  assert.strictEqual(heldCampaigns()[dirA].key, 'GW-31');
  const b = await drive({ ...newRun('buglist'), key: 'GW-32', campaignDir: null, repo: null }, flow, base({ runClaude, runGates: fakeGates().runGates, repoOf: () => '/repo' }));
  assert.match(b.stopReason, /^campaign-held:GW-31/);
  assert.strictEqual(a.stage, 'approve-result');
});

test('stage ném lỗi → stopped crash:<stage>, run.json không kẹt running', async () => {
  const runClaude = async () => { throw new Error('nổ'); };
  const run = await drive(newRun('landing-fix'), loadFlow('landing-fix'), base({ runClaude, runGates: fakeGates().runGates }));
  assert.match(run.stopReason, /^crash:plan/);
  assert.strictEqual(loadRun(run.key, run.runId).status, 'stopped');
});

function tmpGitRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-wt-'));
  const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  git('init', '-q');
  fs.mkdirSync(path.join(repo, 'products/x/landing/a'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'products/x/landing/a/index.html'), '<div></div>');
  git('add', '.');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  return { repo: fs.realpathSync(repo), git };
}

test('G0: stage claude + gate chạy trong worktree riêng autopilot/<KEY>-<runId>, không cwd vào repo thật', async () => {
  const { repo, git } = tmpGitRepo();
  const flow = loadFlow('landing-fix');
  const start = { ...newRun('landing-fix'), repo, repos: [repo], campaignDir: path.join(repo, 'products/x/landing/a'), campaignDirs: [path.join(repo, 'products/x/landing/a')] };
  const { runClaude, calls } = fakeClaude({});
  const gates = fakeGates();
  let run = await drive(start, flow, { now: () => Date.now(), notify: () => {}, runClaude, runGates: gates.runGates });
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, { now: () => Date.now(), notify: () => {}, runClaude, runGates: gates.runGates });

  const wt = path.join(runDir(run.key, run.runId), 'wt', path.basename(repo));
  assert.ok(calls.every((c) => c.cwd === wt), calls.map((c) => c.cwd).join(','));
  assert.ok(calls.every((c) => !c.prompt.includes(`${repo}/products`)));
  assert.strictEqual(gates.calls[0].ctx.repo, wt);
  assert.strictEqual(gates.calls[0].ctx.campaignDir, path.join(wt, 'products/x/landing/a'));
  assert.strictEqual(gates.calls[0].ctx.isolated, true);
  assert.match(git('branch', '--list', `autopilot/${run.key}-${run.runId}`).stdout, /autopilot\//);
  assert.strictEqual(git('status', '--porcelain').stdout, '');
});

test('G0: không tạo được worktree → stopped, không lùi về repo thật', async () => {
  const notGit = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-nogit-'));
  const { runClaude, calls } = fakeClaude({});
  const start = { ...newRun('landing-fix'), repo: notGit, repos: [notGit], campaignDir: notGit, campaignDirs: [notGit] };
  const run = await drive(start, loadFlow('landing-fix'), { now: () => Date.now(), notify: () => {}, runClaude, runGates: fakeGates().runGates });
  assert.match(run.stopReason, /^worktree:/);
  assert.strictEqual(calls.length, 0);
});

test('G0: write-sheet (ghi thật) tự bỏ qua khi chưa có AUTOPILOT_LAB_WRITES', async () => {
  const flow = loadFlow('buglist');
  const { runClaude } = fakeClaude({});
  let run = await drive(newRun('buglist'), flow, base({ runClaude, runGates: fakeGates().runGates }));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.strictEqual(run.status, 'done');
  process.env.AUTOPILOT_LAB_WRITES = '1';
  let gated = await drive(newRun('buglist'), flow, base({ runClaude, runGates: fakeGates().runGates }));
  gated = applyEvent(gated, flow, { type: 'approve' }, Date.now());
  gated = await drive(gated, flow, base({ runClaude, runGates: fakeGates().runGates }));
  delete process.env.AUTOPILOT_LAB_WRITES;
  assert.deepStrictEqual([gated.status, gated.stage], ['attached', 'write-sheet']);
});

test('G2: landing-fix có handoffDir → stage handoff + cổng bàn giao trên worktree gt, commit cả 2 repo', async () => {
  const cdn = tmpGitRepo();
  const gt = tmpGitRepo();
  const flow = loadFlow('landing-fix');
  const start = { ...newRun('landing-fix'), repo: cdn.repo, repos: [cdn.repo, gt.repo], campaignDir: path.join(cdn.repo, 'products/x/landing/a'), campaignDirs: [path.join(cdn.repo, 'products/x/landing/a')], handoffDir: path.join(gt.repo, 'products/x/landing/a') };
  const { runClaude, calls } = fakeClaude({});
  const gates = fakeGates();
  let run = await drive(start, flow, { now: () => Date.now(), notify: () => {}, runClaude, runGates: gates.runGates });
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, { now: () => Date.now(), notify: () => {}, runClaude, runGates: gates.runGates });
  assert.ok(calls.some((c) => c.stageId === 'handoff'));
  const handoffGate = gates.calls.find((c) => c.checks.includes('pm-gate-handoff'));
  assert.deepStrictEqual(handoffGate.checks, ['pm-gate-handoff', 'check-promotion']);
  assert.strictEqual(handoffGate.ctx.campaignDir, path.join(run.worktrees[gt.repo], 'products/x/landing/a'));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, { now: () => Date.now(), notify: () => {}, runClaude, runGates: gates.runGates });
  const commits = gates.calls.filter((c) => c.checks[0] === 'commit').map((c) => c.ctx.repo);
  assert.deepStrictEqual(commits, [run.worktrees[cdn.repo], run.worktrees[gt.repo]]);
});

test('G2: không có handoffDir → bỏ handoff + cổng bàn giao', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({});
  const gates = fakeGates();
  let run = await drive(newRun('landing-fix'), flow, base({ runClaude, runGates: gates.runGates }));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, base({ runClaude, runGates: gates.runGates }));
  assert.strictEqual(run.stage, 'approve-result');
  assert.ok(!calls.some((c) => c.stageId === 'handoff'));
  assert.ok(!gates.calls.some((c) => c.checks.includes('pm-gate-handoff')));
});

test('G2: buglist chạy pm-gate khi diff chạm pm__, ui-check khi chạm file giao diện', async () => {
  const { repo } = tmpGitRepo();
  fs.writeFileSync(path.join(repo, 'products/x/landing/a/index.html'), '<a class="pm__login"></a>');
  const flow = loadFlow('buglist');
  const start = { ...newRun('buglist'), repo, repos: [repo], campaignDir: path.join(repo, 'products/x/landing/a'), campaignDirs: [path.join(repo, 'products/x/landing/a')] };
  const { runClaude, calls } = fakeClaude({ lanes: [{ result: verdict('pass', { files: ['products/x/landing/a/index.html'] }) }] });
  const gates = fakeGates();
  const wtWrite = async (opts) => {
    if (opts.stageId === 'lanes') fs.writeFileSync(path.join(opts.cwd, 'products/x/landing/a/index.html'), '<a class="pm__login x"></a>');
    return runClaude(opts);
  };
  await drive(start, flow, { now: () => Date.now(), notify: () => {}, runClaude: wtWrite, runGates: gates.runGates });
  assert.ok(gates.calls.some((c) => c.checks.join() === 'pm-gate'));
  assert.ok(calls.some((c) => c.stageId === 'ui-check'));
});

test('G2: buglist diff không chạm pm__/giao diện → bỏ pm-gate + ui-check', async () => {
  const flow = loadFlow('buglist');
  const { runClaude, calls } = fakeClaude({ lanes: [{ result: verdict('pass', { files: ['src/api.js'] }) }] });
  const gates = fakeGates();
  await drive(newRun('buglist'), flow, base({ runClaude, runGates: gates.runGates }));
  assert.ok(!gates.calls.some((c) => c.checks.join() === 'pm-gate'));
  assert.ok(!calls.some((c) => c.stageId === 'ui-check'));
});

test('G3: landing-clone chạy thẳng clone → gates → ui-check tới duyệt kết quả, không dừng duyệt plan', async () => {
  const flow = loadFlow('landing-clone');
  const { runClaude, calls } = fakeClaude({ clone: [{ result: verdict('pass', { files: ['products/x/landing/a/index.html'] }) }] });
  const start = { ...newRun('landing-clone'), cloneSource: '/repo/products/x/landing/src' };
  const run = await drive(start, flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'approve-result']);
  assert.deepStrictEqual(calls.map((c) => c.stageId), ['clone', 'ui-check']);
  assert.match(calls[0].prompt, /\/repo\/products\/x\/landing\/src/);
});

test('G4: write-sheet chọn writer theo sheetKind (excel → bug-sheet-tick)', async () => {
  const flow = loadFlow('buglist');
  const { runClaude } = fakeClaude({});
  process.env.AUTOPILOT_LAB_WRITES = '1';
  let run = await drive({ ...newRun('buglist'), sheetKind: 'excel' }, flow, base({ runClaude, runGates: fakeGates().runGates }));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, base({ runClaude, runGates: fakeGates().runGates }));
  delete process.env.AUTOPILOT_LAB_WRITES;
  assert.strictEqual(run.stage, 'write-sheet');
  assert.match(notified.at(-1), /bug-sheet-tick/);
});

test('G5: design-intake dừng ở block hỏi PM, approve là xong — không code, không commit', async () => {
  const flow = loadFlow('design-intake');
  const { runClaude, calls } = fakeClaude({});
  const gates = fakeGates();
  let run = await drive({ ...newRun('design-intake'), repo: null, repos: [], campaignDir: null }, flow, base({ runClaude, runGates: gates.runGates }));
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'pm-block']);
  assert.deepStrictEqual(calls.map((c) => c.stageId), ['fetch-design', 'check-design']);
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  assert.strictEqual(run.status, 'done');
  assert.strictEqual(gates.calls.length, 0);
});

test('G6: gameplay-change luôn dừng ở approve-plan sau relock + plan-review', async () => {
  const flow = loadFlow('gameplay-change');
  const { runClaude, calls } = fakeClaude({});
  const run = await drive(newRun('gameplay-change'), flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'approve-plan']);
  assert.deepStrictEqual(calls.map((c) => c.stageId), ['relock', 'plan', 'plan-review']);
});

test('G7: gates chạy cho từng campaign, prompt lanes liệt kê mọi campaign', async () => {
  const flow = loadFlow('buglist');
  const dirs = ['/repo/products/x/landing/a', '/repo/products/x/landing/b'];
  const { runClaude, calls } = fakeClaude({});
  const gates = fakeGates();
  const run = await drive({ ...newRun('buglist'), campaignDirs: dirs }, flow, base({ runClaude, runGates: gates.runGates }));
  const inWt = dirs.map((d) => d.replace('/repo', run.worktrees['/repo']));
  assert.deepStrictEqual(gates.calls.filter((c) => c.checks.join() === 'build').map((c) => c.ctx.campaignDir), inWt);
  const lanes = calls.find((c) => c.stageId === 'lanes');
  assert.ok(inWt.every((d) => lanes.prompt.includes(d)));
});

test('G9: buglist có bản bàn giao → drift-check chạy trước intake, chỉ được curl/đọc', async () => {
  const flow = loadFlow('buglist');
  const { runClaude, calls } = fakeClaude({});
  await drive({ ...newRun('buglist'), handoffDir: '/repo/gt/x' }, flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual(calls.slice(0, 2).map((c) => c.stageId), ['drift-check', 'intake-triage']);
  assert.strictEqual(calls[0].toolset, 'drift');
  const { TOOLSETS } = await import('./claude-runner.mjs');
  assert.ok(TOOLSETS.drift.includes('Bash(curl:*)') && !TOOLSETS.drift.includes('Edit'));
});

test('G9: buglist không có bản bàn giao → bỏ drift-check', async () => {
  const { runClaude, calls } = fakeClaude({});
  await drive(newRun('buglist'), loadFlow('buglist'), base({ runClaude, runGates: fakeGates().runGates }));
  assert.strictEqual(calls[0].stageId, 'intake-triage');
});

test('pause: marker đặt giữa stage → dừng ngay ở stage đó; resume nối lại stage đó, budget giữ nguyên', async () => {
  const flow = loadFlow('landing-fix');
  const start = newRun('landing-fix');
  const pausing = fakeClaude({});
  const runClaude = async (opts) => {
    if (opts.stageId === 'plan') {
      fs.mkdirSync(runDir(start.key, start.runId), { recursive: true });
      fs.writeFileSync(pauseFile(start.key, start.runId), '');
    }
    return pausing.runClaude(opts);
  };
  let run = await drive(start, flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([run.status, run.stopReason, run.stage], ['stopped', 'paused', 'plan']);
  assert.deepStrictEqual(pausing.calls.map((c) => c.stageId), ['plan']);
  assert.strictEqual(fs.existsSync(pauseFile(start.key, start.runId)), false);
  assert.deepStrictEqual(loadRun(start.key, start.runId).stopReason, 'paused');

  const resumed = resumeRun(run);
  assert.deepStrictEqual([resumed.budget, resumed.loops], [run.budget, run.loops]);
  run = await drive(resumed, flow, base({ runClaude: pausing.runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'approve-plan']);
  assert.deepStrictEqual(pausing.calls.map((c) => c.stageId), ['plan', 'plan', 'plan-review']);
});

test('run mới hiện trên đĩa ngay khi stage đầu đang chạy, đúng stage đang chạy', async () => {
  const start = newRun('landing-fix');
  let seen;
  const runClaude = async () => {
    seen ??= loadRun(start.key, start.runId);
    return { ok: true, sessionId: 's', turns: 1, costUsd: 0.1, ms: 10, result: verdict('pass'), error: null };
  };
  await drive(start, loadFlow('landing-fix'), base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([seen?.status, seen?.stage], ['running', 'plan']);
});

test('buglist: link sheet trong state vào prompt drift-check + intake dù input chỉ là KEY', async () => {
  const { runClaude, calls } = fakeClaude({});
  const start = { ...newRun('buglist'), handoffDir: '/gt/x', sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit' };
  await drive(start, loadFlow('buglist'), base({ runClaude, runGates: fakeGates().runGates, input: 'GW-1' }));
  for (const id of ['drift-check', 'intake-triage']) assert.match(calls.find((c) => c.stageId === id).prompt, /spreadsheets\/d\/abc/);
});

test('dừng ngay: pause giữa stage → không chạy lại, không tính vòng, nhớ phiên để nối', async () => {
  const start = newRun('landing-fix');
  let calls = 0;
  const runClaude = async () => {
    calls++;
    fs.mkdirSync(runDir(start.key, start.runId), { recursive: true });
    fs.writeFileSync(pauseFile(start.key, start.runId), '');
    return { ok: false, sessionId: 's-plan', turns: 0, costUsd: 0, ms: 5, result: '', error: 'exit null' };
  };
  const run = await drive(start, loadFlow('landing-fix'), base({ runClaude, runGates: fakeGates().runGates }));
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual([run.status, run.stopReason, run.stage, run.receipts.length], ['stopped', 'paused', 'plan', 0]);
  assert.deepStrictEqual(run.cutSession, { stage: 'plan', sessionId: 's-plan' });
  assert.strictEqual(fs.existsSync(pauseFile(start.key, start.runId)), false);
});

test('chạy tiếp sau dừng ngay → nối đúng phiên đang dở, xong thì quên phiên', async () => {
  const { runClaude, calls } = fakeClaude({});
  const cut = { ...newRun('landing-fix'), status: 'stopped', stopReason: 'paused', cutSession: { stage: 'plan', sessionId: 's-plan' }, resumeNote: 'thêm tab sự kiện' };
  const run = await drive(resumeRun(cut, {}), loadFlow('landing-fix'), base({ runClaude, runGates: fakeGates().runGates }));
  assert.strictEqual(calls[0].resumeSessionId, 's-plan');
  assert.match(calls[0].prompt, /bị dừng giữa chừng[\s\S]*thêm tab sự kiện/);
  assert.doesNotMatch(calls[1].prompt, /thêm tab sự kiện/);
  assert.strictEqual(calls[1].resumeSessionId, null);
  assert.deepStrictEqual([run.cutSession, run.resumeNote], [undefined, undefined]);
});
