import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-drive-'));
const { drive, runGateStage } = await import('./driver.mjs');
const { createRun, applyEvent, resumeRun, reopenRun, chooseAction } = await import('./engine.mjs');
const { loadFlow } = await import('./flows.mjs');
const { runDir, loadRun, saveRun, pauseFile } = await import('./store.mjs');
const { holdCampaign, heldCampaigns, holdRepo } = await import('./lock.mjs');

const verdict = (v, extra = {}) => '```autopilot-verdict\n' + JSON.stringify({ verdict: v, ...extra }) + '\n```';

function fakeClaude(script) {
  const calls = [];
  const runClaude = async (opts) => {
    calls.push(opts);
    const list = script[opts.stageId] ?? [{ result: verdict('pass') }];
    const entry = list[opts.round - 1] ?? list.at(-1);
    if (entry.log) fs.writeFileSync(opts.logFile, entry.log);
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
const fakeRepoState = (repo) => ({ top: repo, branch: 'tont', head: 'h0', dirty: [] });
const base = (extra = {}) => ({ now: () => Date.now(), notify: (t, m) => notified.push(m), repoState: fakeRepoState, ...extra });
const newRun = (flowId) =>
  createRun({ key: 'GW-1', runId: `r${Math.random().toString(36).slice(2, 8)}`, flow: loadFlow(flowId), routerReason: 't', repo: '/repo', campaignDir: '/repo/products/x/landing/a', now: Date.now() });

// Các test dùng chung repo giả /repo: mỗi test bắt đầu khi chưa run nào giữ repo
beforeEach(() => {
  notified.length = 0;
  fs.rmSync(path.join(process.env.AUTOPILOT_RUNS_DIR, '.repos.json'), { force: true });
});

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

const evidenceFlow = {
  id: 'evidence-test',
  ask: [{ need: ['campaignDir'], question: '?' }],
  stages: [{ id: 'design-compare', kind: 'claude', prompt: 'design-compare.md', toolset: 'browser', model: 'opus', requireEvidence: true, next: null }],
};
const evidenceRun = () => createRun({ key: 'GW-1', runId: `e${Math.random().toString(36).slice(2, 8)}`, flow: evidenceFlow, routerReason: 't', repo: '/repo', campaignDir: '/repo/products/x/landing/a', now: Date.now() });
const cropFile = () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-crop-')), 'pc-01.png');
  fs.writeFileSync(file, 'png');
  return file;
};
const readEvent = (file) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: file } }] } });

test('requireEvidence: pass mà chưa mở ảnh nào → nhắc 1 lần trong cùng phiên, vẫn thiếu → stopped evidence', async () => {
  const crop = cropFile();
  const calls = [];
  const runClaude = async (opts) => {
    calls.push(opts);
    return { ok: true, sessionId: 's-dc', turns: 1, costUsd: 0, ms: 1, result: verdict('pass', { evidence: [crop] }) };
  };
  const run = await drive(evidenceRun(), evidenceFlow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([run.status, run.stopReason], ['stopped', 'evidence:design-compare']);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].resumeSessionId, 's-dc');
  assert.match(calls[1].prompt, /chưa mở bằng Read/);
});

test('requireEvidence: lượt nhắc mở đủ ảnh → pass, run done', async () => {
  const crop = cropFile();
  let n = 0;
  const runClaude = async (opts) => {
    if (++n === 2) fs.writeFileSync(opts.logFile, readEvent(crop) + '\n');
    return { ok: true, sessionId: 's-dc', turns: 1, costUsd: 0, ms: 1, result: verdict('pass', { evidence: [crop] }) };
  };
  const run = await drive(evidenceRun(), evidenceFlow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.strictEqual(run.status, 'done');
});

test('requireEvidence: revise không cần bằng chứng (đã có lỗi để sửa)', async () => {
  const calls = [];
  const runClaude = async (opts) => {
    calls.push(opts);
    return { ok: true, sessionId: 's-dc', turns: 1, costUsd: 0, ms: 1, result: verdict('fail', { blocking: ['lệch'] }) };
  };
  const run = await drive(evidenceRun(), evidenceFlow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(run.stopReason, 'fail:design-compare');
});

test('gate error → stopped gate-error:<check>', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude } = fakeClaude({});
  let run = await drive(newRun('landing-fix'), flow, base({ runClaude, runGates: fakeGates().runGates }));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, base({ runClaude, runGates: fakeGates({ 'build,pm-gate,fe-gate,landing-parity,layout-gate': ['error'] }).runGates }));
  assert.match(run.stopReason, /^gate-error:build( — |$)/);
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
  const a = await drive({ ...newRun('buglist'), key: 'GW-31', campaignDir: null, repo: null, repos: [] }, flow, base({ runClaude, runGates: fakeGates().runGates, repoOf: () => '/repo' }));
  assert.strictEqual(heldCampaigns()[dirA].key, 'GW-31');
  const b = await drive({ ...newRun('buglist'), key: 'GW-32', campaignDir: null, repo: null, repos: [] }, flow, base({ runClaude, runGates: fakeGates().runGates, repoOf: () => '/repo' }));
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

const onRepo = (repo, extra = {}) => ({ ...newRun('landing-fix'), repo, repos: [repo], campaignDir: path.join(repo, 'products/x/landing/a'), campaignDirs: [path.join(repo, 'products/x/landing/a')], ...extra });
const realDeps = (extra) => ({ now: () => Date.now(), notify: () => {}, ...extra });

test('R19: stage claude + gate chạy thẳng trên repo gốc, nhánh đang checkout; ghi workBranch/startHead/dirtyAtStart, không worktree/nhánh riêng', async () => {
  const { repo, git } = tmpGitRepo();
  fs.writeFileSync(path.join(repo, 'dang-do.txt'), 'của phiên khác');
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({});
  const gates = fakeGates();
  let run = await drive(onRepo(repo), flow, realDeps({ runClaude, runGates: gates.runGates }));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, realDeps({ runClaude, runGates: gates.runGates }));

  assert.ok(calls.every((c) => c.cwd === repo && c.writable[0] === repo && c.writable[1] === runDir(run.key, run.runId)), calls.map((c) => c.cwd).join(','));
  assert.deepStrictEqual([gates.calls[0].ctx.repo, gates.calls[0].ctx.campaignDir], [repo, path.join(repo, 'products/x/landing/a')]);
  assert.deepStrictEqual(run.worktrees, {});
  assert.deepStrictEqual(run.workBranch, { [repo]: git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim() });
  assert.deepStrictEqual(run.startHead, { [repo]: git('rev-parse', 'HEAD').stdout.trim() });
  assert.deepStrictEqual(run.dirtyAtStart, { [repo]: ['dang-do.txt'] });
  assert.deepStrictEqual(gates.calls[0].ctx.dirty, ['dang-do.txt']);
  assert.strictEqual(git('branch', '--list', 'autopilot/*').stdout, '');
});

test('R19: thư mục không phải git → stopped repo:, không chạy stage nào', async () => {
  const notGit = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-nogit-'));
  const { runClaude, calls } = fakeClaude({});
  const start = { ...newRun('landing-fix'), repo: notGit, repos: [notGit], campaignDir: notGit, campaignDirs: [notGit] };
  const run = await drive(start, loadFlow('landing-fix'), realDeps({ runClaude, runGates: fakeGates().runGates }));
  assert.match(run.stopReason, /^repo:/);
  assert.strictEqual(calls.length, 0);
});

test('R19: nhánh repo bị đổi giữa chừng → stopped nói rõ, không tự checkout, stage sau không chạy', async () => {
  const { repo, git } = tmpGitRepo();
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({});
  const deps = realDeps({ runClaude, runGates: fakeGates().runGates });
  const paused = await drive(onRepo(repo), flow, deps);
  git('checkout', '-q', '-b', 'khac');
  calls.length = 0;
  const run = await drive(applyEvent(paused, flow, { type: 'approve' }, Date.now()), flow, deps);
  assert.strictEqual(run.status, 'stopped');
  assert.match(run.stopReason, /nhánh khac.*checkout lại/);
  assert.deepStrictEqual(calls, []);
  assert.strictEqual(git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim(), 'khac');
});

test('2 run cùng repo, khác campaign → chạy song song; run chưa có campaign thì giữ riêng repo', async () => {
  const { repo } = tmpGitRepo();
  const flow = loadFlow('landing-fix');
  const deps = realDeps({ runClaude: fakeClaude({}).runClaude, runGates: fakeGates().runGates });
  const first = await drive(onRepo(repo), flow, deps);
  assert.strictEqual(first.status, 'paused');
  const other = path.join(repo, 'products/x/landing/b');
  const second = await drive(onRepo(repo, { key: 'GW-2', campaignDir: other, campaignDirs: [other] }), flow, deps);
  assert.strictEqual(second.status, 'paused', second.stopReason);
  const whole = await drive(onRepo(repo, { key: 'GW-3', campaignDir: null, campaignDirs: [] }), flow, deps);
  assert.match(whole.stopReason, /repo đang có run GW-1/);
  assert.strictEqual(whole.receipts.length, 0);
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
  assert.strictEqual(handoffGate.ctx.campaignDir, path.join(gt.repo, 'products/x/landing/a'));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, { now: () => Date.now(), notify: () => {}, runClaude, runGates: gates.runGates });
  const commits = gates.calls.filter((c) => c.checks[0] === 'commit').map((c) => c.ctx.repo);
  assert.deepStrictEqual(commits, [cdn.repo, gt.repo]);
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
  assert.deepStrictEqual(gates.calls.filter((c) => c.checks.join() === 'build').map((c) => c.ctx.campaignDir), dirs);
  const lanes = calls.find((c) => c.stageId === 'lanes');
  assert.ok(dirs.every((d) => lanes.prompt.includes(d)));
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

const committingGates = async (checks, ctx) => {
  if (checks.includes('commit')) {
    fs.writeFileSync(path.join(ctx.campaignDir, 'index.html'), `<p>${Date.now()}</p>`);
    spawnSync('git', ['-C', ctx.repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'ap'], { encoding: 'utf8' });
    const commit = spawnSync('git', ['-C', ctx.repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    return { pass: true, error: null, results: [{ check: 'commit', status: 'pass', blocking: [], note: '', commit }] };
  }
  return { pass: true, error: null, results: checks.map((check) => ({ check, status: 'pass', blocking: [], note: '' })) };
};

test('done: báo chờ review kèm số file + repo đã sửa', async () => {
  const { repo } = tmpGitRepo();
  const flow = loadFlow('landing-fix');
  const start = { ...newRun('landing-fix'), repo, repos: [repo], campaignDir: path.join(repo, 'products/x/landing/a'), campaignDirs: [path.join(repo, 'products/x/landing/a')] };
  const deps = { now: () => Date.now(), notify: (t, m) => notified.push(m), runClaude: fakeClaude({}).runClaude, runGates: committingGates };
  let run = await drive(start, flow, deps);
  for (let i = 0; i < 3 && run.status === 'paused'; i++) run = await drive(applyEvent(run, flow, { type: 'approve' }, Date.now()), flow, deps);
  assert.strictEqual(run.status, 'done');
  assert.deepStrictEqual(run.commits.map((c) => c.repo), [repo]);
  assert.match(notified.at(-1), /chờ review · 1 file ở ap-wt-/);
});

test('run trả về sau review: fix → cổng → bỏ mốc duyệt kết quả → commit lại → done', async () => {
  const flow = loadFlow('landing-new');
  const done = { ...newRun('landing-new'), status: 'done', stage: null, worktrees: {} };
  const crop = cropFile();
  const { runClaude, calls } = fakeClaude({ 'design-compare': [{ result: verdict('pass', { evidence: [crop] }), log: readEvent(crop) }] });
  const gates = fakeGates();
  const run = await drive(reopenRun(done, flow, 'nút lệch 4px', Date.now()), flow, base({ runClaude, runGates: gates.runGates }));
  assert.strictEqual(run.status, 'done');
  // sửa sau review phải qua lại cả so design, không chỉ cổng máy
  assert.deepStrictEqual(calls.map((c) => c.stageId), ['fix', 'ui-check', 'design-compare', 'clean-code']);
  assert.match(calls[0].prompt, /nút lệch 4px/);
  assert.deepStrictEqual(gates.calls.map((c) => c.checks.at(-1)), ['layout-gate', 'layout-gate', 'commit']);
  assert.ok(!run.receipts.some((r) => r.stage === 'approve-result'));
});

const planned = (plan, flowId = 'landing-fix') =>
  createRun({ key: 'GW-1', runId: `r${Math.random().toString(36).slice(2, 8)}`, flow: loadFlow(flowId), routerReason: 't', repo: '/repo', campaignDir: '/repo/products/x/landing/a', now: Date.now(), ...plan });
const atImplement = (run, flow) => applyEvent([1, 2].reduce((r) => applyEvent(r, flow, { type: 'pass' }, Date.now()), run), flow, { type: 'approve' }, Date.now());

test('plan: stage tắt → receipt skipped-by-user, không gọi runClaude cho stage đó', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({});
  const run = await drive(planned({ disabled: ['plan-review'] }), flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual(calls.map((c) => c.stageId), ['plan']);
  assert.partialDeepStrictEqual(run.receipts.find((r) => r.stage === 'plan-review'), { stage: 'plan-review', verdict: 'skipped-by-user', note: 'tắt từ đầu', blocking: 0, advisory: 0, turns: 0, costUsd: 0, ms: 0 });
  assert.strictEqual(run.stage, 'approve-plan');
});

test('plan: gates tắt kèm skipReason → gateSkipped ghi lý do', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude } = fakeClaude({});
  const gates = fakeGates();
  let run = await drive(planned({ disabled: ['gates'], skipReason: 'đã build tay' }), flow, base({ runClaude, runGates: gates.runGates }));
  run = applyEvent(run, flow, { type: 'approve' }, Date.now());
  run = await drive(run, flow, base({ runClaude, runGates: gates.runGates }));
  assert.deepStrictEqual(run.gateSkipped.map(({ stage, reason }) => ({ stage, reason })), [{ stage: 'gates', reason: 'đã build tay' }]);
  assert.strictEqual(gates.calls.some((c) => c.checks.includes('build')), false);
});

test('plan: điểm dừng implement → stopped breakpoint:implement, stage = stage kế; resume chạy tới mốc pause kế', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({});
  const gates = fakeGates();
  const start = atImplement(planned({ breakpoints: ['implement'] }), flow);
  const first = await drive(start, flow, base({ runClaude, runGates: gates.runGates }));
  assert.deepStrictEqual([first.status, first.stopReason, first.stage], ['stopped', 'breakpoint:implement', 'code-review']);
  assert.deepStrictEqual(calls.map((c) => c.stageId), ['implement']);
  const next = await drive(resumeRun(first, {}), flow, base({ runClaude, runGates: gates.runGates }));
  assert.deepStrictEqual([next.status, next.stage], ['paused', 'approve-result']);
});

test('plan: điểm dừng ngay trước stage pause → vẫn paused, không đổi thành stopped', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude } = fakeClaude({});
  const run = await drive(planned({ breakpoints: ['plan-review'] }), flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'approve-plan']);
});

test('choice: phương án đã chọn vào prompt implement; không note thì không xuống dòng thừa', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({});
  const start = { ...atImplement(planned({}), flow), choice: { id: 'A', title: 'Một tab', note: 'giữ nút cũ' } };
  await drive(start, flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.match(calls[0].prompt, /A · Một tab\ngiữ nút cũ/);
  const bare = await import('./driver.mjs');
  assert.strictEqual(bare.stageVars({ ...start, choice: { id: 'B', title: 'Hai', note: null } }, { id: 'implement' }).choice, 'B · Hai');
  assert.strictEqual(bare.stageVars({ ...start, choice: null }, { id: 'implement' }).choice, '');
});

test('run cũ không có plan → chạy như trước', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({});
  const { plan, ...old } = newRun('landing-fix');
  const run = await drive(old, flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([run.stage, calls.length], ['approve-plan', 2]);
});

test('goto sau dừng ngay: không nối cutSession cũ, chạy phiên mới', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({});
  const gates = fakeGates();
  const halted = await drive(atImplement(planned({ breakpoints: ['implement'] }), flow), flow, base({ runClaude, runGates: gates.runGates }));
  const cut = { ...halted, cutSession: { stage: 'implement', sessionId: 's-old' }, resumeNote: 'cũ' };
  const again = chooseAction(cut, flow, { type: 'goto', stage: 'implement' }, { now: Date.now() });
  calls.length = 0;
  await drive({ ...again, plan: { ...again.plan, breakpoints: [] } }, flow, base({ runClaude, runGates: gates.runGates }));
  assert.strictEqual(calls[0].stageId, 'implement');
  assert.ok(calls.every((c) => c.resumeSessionId !== 's-old' && !/bị dừng giữa chừng/.test(c.prompt)));
});

test('plan: điểm dừng ghi vào run.json trong lúc stage chạy → driver dừng đúng chỗ, không ghi đè', async () => {
  const flow = loadFlow('landing-fix');
  const start = atImplement(planned({}), flow);
  const { runClaude: fake } = fakeClaude({});
  const runClaude = async (opts) => {
    if (opts.stageId === 'implement') {
      const onDisk = loadRun(start.key, start.runId);
      saveRun({ ...onDisk, plan: { ...onDisk.plan, breakpoints: ['code-review'] } });
    }
    return fake(opts);
  };
  const run = await drive(start, flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.deepStrictEqual([run.status, run.stopReason], ['stopped', 'breakpoint:code-review']);
  assert.deepStrictEqual(loadRun(start.key, start.runId).plan.breakpoints, ['code-review']);
});

const atApproveResult = async (flow, deps, plan = {}) => {
  const run = await drive(atImplement(planned(plan), flow), flow, deps);
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'approve-result']);
  return run;
};

test('goto code-review với note: prompt code-review nhận note 1 lần, stage sau không thấy, rejectNote bị xoá', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({ 'code-review': [{ result: verdict('pass') }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('pass') }] });
  const deps = base({ runClaude, runGates: fakeGates().runGates });
  const paused = await atApproveResult(flow, deps);
  calls.length = 0;
  const run = await drive(chooseAction(paused, flow, { type: 'goto', stage: 'code-review', note: 'NOTE-XYZ' }, { now: Date.now() }), flow, deps);
  assert.deepStrictEqual(calls.map((c) => c.stageId), ['code-review', 'fix', 'code-review', 'ui-check']);
  assert.match(calls[0].prompt, /Ghi chú của user khi quay lại: NOTE-XYZ/);
  assert.ok(calls.slice(1).every((c) => !c.prompt.includes('NOTE-XYZ')));
  assert.strictEqual(run.rejectNote, null);
});

test('reject ở approve-result: fix.md đã có {{rejectNote}} → note không bị nối lần 2', async () => {
  const flow = loadFlow('landing-fix');
  const { runClaude, calls } = fakeClaude({});
  const deps = base({ runClaude, runGates: fakeGates().runGates });
  const paused = await atApproveResult(flow, deps);
  calls.length = 0;
  await drive(applyEvent(paused, flow, { type: 'reject', note: 'NOTE-ABC' }, Date.now()), flow, deps);
  assert.strictEqual(calls[0].prompt.split('NOTE-ABC').length, 2);
  assert.ok(!calls[0].prompt.includes('Ghi chú của user khi quay lại'));
});

test('gates tắt từ đầu, goto gates → gates chạy thật, gateSkipped không ghi trùng', async () => {
  const flow = loadFlow('landing-fix');
  const gates = fakeGates();
  const deps = base({ runClaude: fakeClaude({}).runClaude, runGates: gates.runGates });
  const paused = await atApproveResult(flow, deps, { disabled: ['gates'], skipReason: 'build hỏng sẵn' });
  assert.strictEqual(gates.calls.some((c) => c.checks.includes('build')), false);
  const run = await drive(chooseAction(paused, flow, { type: 'goto', stage: 'gates', note: 'chạy cổng thật' }, { now: Date.now() }), flow, deps);
  assert.ok(gates.calls.some((c) => c.checks.includes('build')));
  assert.deepStrictEqual(run.plan.disabled, []);
  assert.strictEqual(run.gateSkipped.length, 1);
});

test('cổng tắt nhưng tự bỏ theo luật when → không tính vào gateSkipped', async () => {
  const flow = loadFlow('landing-fix');
  const deps = base({ runClaude: fakeClaude({}).runClaude, runGates: fakeGates().runGates });
  const run = await atApproveResult(flow, deps, { disabled: ['handoff-gates'], skipReason: 'không cần' });
  assert.deepStrictEqual(run.gateSkipped, []);
});

test('I1: cổng commit lỗi pull → stopped kèm lý do của cổng, run.pullPending; lần sau đạt thì xoá pullPending', async () => {
  const flow = loadFlow('landing-fix');
  const stage = flow.stages.find((s) => s.checks?.includes('commit'));
  const run = { ...newRun('landing-fix'), receipts: [] };
  const failing = async () => ({ pass: false, error: 'commit', results: [{ check: 'commit', status: 'error', blocking: ['CONFLICT'], note: 'commit abc đã có, pull lỗi', commit: 'abc', pullPending: true }] });
  const ev = await runGateStage(run, stage, { now: Date.now, runGates: failing });
  assert.strictEqual(ev.reason, 'gate-error:commit — commit abc đã có, pull lỗi');
  assert.strictEqual(run.pullPending, true);
  const ok = async () => ({ pass: true, error: null, results: [{ check: 'commit', status: 'pass', blocking: [], note: 'đã pull' }] });
  await runGateStage(run, stage, { now: Date.now, runGates: ok });
  assert.strictEqual(run.pullPending, false);
});

test('abort rơi vào lúc claimRepos chạy git status → không ghi lại run.json, không chạy stage', async () => {
  const key = 'GW-ABORT-CLAIM';
  let calls = 0;
  const run0 = createRun({ key, runId: 'r1', flow: loadFlow('landing-fix'), routerReason: 't', repo: '/repo', campaignDir: '/repo/c', now: Date.now() });
  saveRun(run0);
  const repoState = (repo) => {
    if (++calls === 1) fs.rmSync(runDir(key, 'r1'), { recursive: true, force: true });
    return fakeRepoState(repo);
  };
  const claude = fakeClaude({});
  const out = await drive(run0, loadFlow('landing-fix'), { notify: () => {}, repoState, runClaude: claude.runClaude, runGates: fakeGates().runGates });
  assert.strictEqual(out.stopReason, 'aborted');
  assert.strictEqual(claude.calls.length, 0);
  assert.strictEqual(loadRun(key, 'r1'), null);
});

test('pause bấm trong stage cuối trước mốc chờ user → mốc đó xoá .pause, approve xong chạy tiếp không bị halt oan', async () => {
  const key = 'GW-STALE-PAUSE';
  const flow = loadFlow('landing-fix');
  let run = { ...createRun({ key, runId: 'r1', flow, routerReason: 't', repo: '/repo', campaignDir: '/repo/c', handoffDir: '/repo/h', now: Date.now() }), stage: 'handoff-gates' };
  saveRun(run);
  const runGates = async (checks) => {
    if (checks.includes('check-promotion')) fs.writeFileSync(pauseFile(key, 'r1'), '');
    return { pass: true, error: null, results: [] };
  };
  const deps = { notify: () => {}, repoState: fakeRepoState, runClaude: fakeClaude({}).runClaude, runGates };
  run = await drive(run, flow, deps);
  assert.strictEqual(run.stage, 'approve-result');
  assert.ok(!fs.existsSync(pauseFile(key, 'r1')));
  run = await drive(applyEvent(run, flow, { type: 'approve' }, Date.now()), flow, deps);
  assert.strictEqual(run.status, 'done');
});

test('commit xong chỉ còn lỗi pull → nhả repo cho run khác; lỗi commit thật thì vẫn giữ', async () => {
  const stage = loadFlow('landing-fix').stages.find((s) => s.checks?.includes('commit'));
  const gates = (extra) => async () => ({ pass: false, error: 'commit', results: [{ check: 'commit', status: 'error', blocking: [], note: 'x', ...extra }] });
  const other = { key: 'GW-OTHER', runId: 'o1' };

  const pulling = { ...newRun('landing-fix'), runId: 'pull-1', receipts: [] };
  saveRun(pulling);
  holdRepo('/repo-pull', pulling);
  await runGateStage(pulling, stage, { now: Date.now, runGates: gates({ commit: 'abc', pullPending: true }) });
  assert.strictEqual(holdRepo('/repo-pull', other).ok, true);

  const conflicted = { ...newRun('landing-fix'), runId: 'conflict-1', receipts: [] };
  saveRun(conflicted);
  holdRepo('/repo-conflict', conflicted);
  await runGateStage(conflicted, stage, { now: Date.now, runGates: gates({ commit: 'abc', pullPending: true, midMerge: true }) });
  assert.strictEqual(holdRepo('/repo-conflict', other).ok, false);

  const broken = { ...newRun('landing-fix'), runId: 'broken-1', receipts: [] };
  saveRun(broken);
  holdRepo('/repo-broken', broken);
  await runGateStage(broken, stage, { now: Date.now, runGates: gates({}) });
  assert.strictEqual(holdRepo('/repo-broken', other).ok, false);
});

test('cổng commit chờ lượt khi run khác đang commit, tới lượt thì chạy; huỷ trong lúc chờ thì không commit', async () => {
  const { acquire, release } = await import('./lock.mjs');
  const flow = loadFlow('landing-fix');
  const stage = flow.stages.find((s) => s.checks?.includes('commit'));
  const other = { key: 'GW-COMMITTING', runId: 'c1' };
  const gates = fakeGates();
  const deps = { notify: () => {}, repoState: fakeRepoState, runClaude: fakeClaude({}).runClaude, runGates: gates.runGates };

  const waiting = { ...createRun({ key: 'GW-WAIT', runId: 'w1', flow, routerReason: 't', repo: '/repo', campaignDir: '/repo/c', now: Date.now() }), stage: stage.id };
  saveRun(waiting);
  acquire('commit', other);
  const started = Date.now();
  setTimeout(() => release('commit', other), 300);
  await drive(waiting, flow, deps);
  assert.ok(Date.now() - started >= 300);
  assert.ok(gates.calls.some((c) => c.checks.includes('commit')));

  const cancelled = { ...createRun({ key: 'GW-CANCEL', runId: 'k1', flow, routerReason: 't', repo: '/repo', campaignDir: '/repo/d', now: Date.now() }), stage: stage.id };
  saveRun(cancelled);
  acquire('commit', other);
  gates.calls.length = 0;
  setTimeout(() => saveRun({ ...loadRun('GW-CANCEL', 'k1'), status: 'stopped', stopReason: 'aborted' }), 100);
  const out = await drive(cancelled, flow, deps);
  release('commit', other);
  assert.strictEqual(out.stopReason, 'aborted');
  assert.ok(!gates.calls.some((c) => c.checks.includes('commit')));
});

test('stage dùng trình duyệt (ui-check) chờ khi run khác đang giữ trình duyệt, không gọi claude', async () => {
  const { acquire, release } = await import('./lock.mjs');
  const flow = loadFlow('landing-fix');
  const other = { key: 'GW-BROWSING', runId: 'b1' };
  const claude = fakeClaude({});
  const run = { ...createRun({ key: 'GW-UI', runId: 'u1', flow, routerReason: 't', repo: '/repo', campaignDir: '/repo/e', now: Date.now() }), stage: 'ui-check' };
  saveRun(run);
  acquire('browser', other);
  setTimeout(() => saveRun({ ...loadRun('GW-UI', 'u1'), status: 'stopped', stopReason: 'aborted' }), 100);
  const out = await drive(run, flow, { notify: () => {}, repoState: fakeRepoState, runClaude: claude.runClaude, runGates: fakeGates().runGates });
  release('browser', other);
  assert.strictEqual(out.stopReason, 'aborted');
  assert.strictEqual(claude.calls.length, 0);
});

test('runner hết giờ → lượt lại resume đúng phiên vừa bị cắt, ghi log riêng', async () => {
  const { runClaude, calls } = fakeClaude({ plan: [{ ok: false }] });
  await drive(newRun('landing-fix'), loadFlow('landing-fix'), base({ runClaude, runGates: fakeGates().runGates }));
  const [first, retry] = calls.filter((c) => c.stageId === 'plan');
  assert.strictEqual(retry.resumeSessionId, 's-plan');
  assert.match(retry.prompt, /làm tiếp từ chỗ dở/i);
  assert.notStrictEqual(retry.logFile, first.logFile);
});

test('stage khai timeoutMinutes → runner nhận timeoutMs tương ứng', async () => {
  const flow = loadFlow('landing-fix');
  flow.stages.find((s) => s.id === 'plan').timeoutMinutes = 45;
  const { runClaude, calls } = fakeClaude({});
  await drive(newRun('landing-fix'), flow, base({ runClaude, runGates: fakeGates().runGates }));
  assert.strictEqual(calls.find((c) => c.stageId === 'plan').timeoutMs, 45 * 60_000);
  assert.strictEqual(calls.find((c) => c.stageId !== 'plan').timeoutMs, undefined);
});

test('WHEN.hasDesign: chỉ khi run sửa file UI VÀ designs/<KEY> có ảnh', async () => {
  const { WHEN } = await import('./driver.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-data-'));
  process.env.AUTOPILOT_DATA_ROOT = root;
  const ui = { key: 'GW-7', files: ['products/x/landing/a/assets/main/main.scss'] };
  assert.strictEqual(WHEN.hasDesign(ui), false);
  fs.mkdirSync(path.join(root, 'designs', 'GW-7', '_src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'designs', 'GW-7', '_src', 'web.png'), 'png');
  assert.strictEqual(WHEN.hasDesign(ui), true);
  assert.strictEqual(WHEN.hasDesign({ key: 'GW-7', files: ['tools/x.mjs'] }), false);
  delete process.env.AUTOPILOT_DATA_ROOT;
});
