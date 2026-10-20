import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const CLI = path.join(import.meta.dirname, 'autopilot.mjs');
const verdict = (v, extra = {}) => '```autopilot-verdict\n' + JSON.stringify({ verdict: v, ...extra }) + '\n```';

function sandbox(fakeScript = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-cli-'));
  const campaign = path.join(root, 'repo/products/x/landing/a');
  fs.mkdirSync(campaign, { recursive: true });
  const git = (...args) => spawnSync('git', args, { cwd: path.join(root, 'repo'), encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  const fake = path.join(root, 'fake.json');
  fs.writeFileSync(fake, JSON.stringify(fakeScript));
  const env = { ...process.env, AUTOPILOT_RUNS_DIR: path.join(root, 'runs'), AUTOPILOT_FAKE: fake, AUTOPILOT_FAKE_GATES: 'pass', AUTOPILOT_NO_NOTIFY: '1' };
  const cli = (...args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  return { cli, campaign, runs: env.AUTOPILOT_RUNS_DIR };
}

const lastRun = (runs, key) => {
  const dir = path.join(runs, key);
  const id = fs.readdirSync(dir).sort().at(-1);
  return JSON.parse(fs.readFileSync(path.join(dir, id, 'run.json'), 'utf8'));
};

for (const flow of ['landing-fix', 'feature', 'landing-new']) {
  test(`${flow}: run → approve từng mốc → done`, () => {
    const { cli, campaign, runs } = sandbox();
    assert.strictEqual(cli('run', 'GW-1', '--flow', flow, '--campaign', campaign).code, 0);
    for (let i = 0; i < 5 && lastRun(runs, 'GW-1').status === 'paused'; i++) cli('approve', 'GW-1');
    assert.strictEqual(lastRun(runs, 'GW-1').status, 'done');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8')), {});
  });
}

test('buglist: chưa bật AUTOPILOT_LAB_WRITES → bỏ write-sheet, approve kết quả là done', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-2', '--flow', 'buglist', '--campaign', campaign);
  cli('approve', 'GW-2');
  const run = lastRun(runs, 'GW-2');
  assert.strictEqual(run.status, 'done');
  assert.strictEqual(Object.values(run.worktrees).filter((wt) => wt.startsWith(runs)).length, 1);
});

test('plan-review revise 4 lần → stopped loop-exhausted, status báo lý do', () => {
  const { cli, campaign } = sandbox({ 'plan-review': [{ result: verdict('revise', { blocking: ['thiếu tab'] }) }] });
  cli('run', 'GW-3', '--flow', 'landing-fix', '--campaign', campaign);
  const status = cli('status', 'GW-3');
  assert.match(status.out, /stopped \(loop-exhausted:plan-review\)/);
  assert.match(status.out, /Tổng: 8 lượt claude/);
});

test('reject có note → note vào prompt plan vòng sau', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-4', '--flow', 'landing-fix', '--campaign', campaign);
  cli('reject', 'GW-4', '--note', 'thêm trạng thái đã nhận');
  const run = lastRun(runs, 'GW-4');
  assert.strictEqual(run.rejectNote, 'thêm trạng thái đã nhận');
  assert.strictEqual(run.stage, 'approve-plan');
});

test('run thứ 2 khi lock đang bị giữ bởi PID sống → từ chối', () => {
  const { cli, campaign, runs } = sandbox();
  fs.mkdirSync(runs, { recursive: true });
  fs.writeFileSync(path.join(runs, '.lock-run'), JSON.stringify({ pid: process.pid, key: 'GW-9', runId: 'x' }));
  const r = cli('run', 'GW-5', '--flow', 'landing-fix', '--campaign', campaign);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /GW-9/);
});

test('resume sau loop-exhausted chạy tiếp', () => {
  const { cli, campaign, runs } = sandbox({ 'plan-review': [{ result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('pass') }] });
  cli('run', 'GW-6', '--flow', 'landing-fix', '--campaign', campaign);
  assert.strictEqual(lastRun(runs, 'GW-6').status, 'stopped');
  cli('resume', 'GW-6');
  assert.strictEqual(lastRun(runs, 'GW-6').stage, 'approve-plan');
});

test('abort nhả campaign + dọn sạch: worktree, nhánh autopilot/*, thư mục run', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-7', '--flow', 'landing-fix', '--campaign', campaign);
  const { runId } = lastRun(runs, 'GW-7');
  const repo = path.resolve(campaign, '../../../..');
  assert.strictEqual(cli('abort', 'GW-7').code, 0);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8')), {});
  assert.strictEqual(fs.existsSync(path.join(runs, 'GW-7')), false, 'thư mục task rỗng cũng phải xoá');
  assert.strictEqual(spawnSync('git', ['-C', repo, 'branch', '--list', `autopilot/GW-7-${runId}`], { encoding: 'utf8' }).stdout.trim(), '');
  assert.doesNotMatch(spawnSync('git', ['-C', repo, 'worktree', 'list'], { encoding: 'utf8' }).stdout, /GW-7/);
});

test('route --validate báo mọi luồng hợp lệ', () => {
  const { cli } = sandbox();
  const r = cli('route', '--validate');
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /\d+ luồng hợp lệ: .*landing-clone/);
});

test('run thứ 2 cùng campaign khi run trước còn giữ → từ chối, không ghi đè quyền giữ', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-10', '--flow', 'landing-fix', '--campaign', campaign);
  const r = cli('run', 'GW-11', '--flow', 'landing-fix', '--campaign', campaign);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /GW-10/);
  assert.deepStrictEqual(Object.values(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8'))).map((o) => o.key), ['GW-10']);
});

test('route đọc phase từ AUTOPILOT_DATA_ROOT khi code chạy ở worktree khác', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-data-'));
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify({ issues: { 'GW-1': { phase: 'bugfix' } } }));
  const r = spawnSync(process.execPath, [CLI, 'route', 'GW-1'], { env: { ...process.env, AUTOPILOT_DATA_ROOT: data }, encoding: 'utf8' });
  assert.match(r.stdout + r.stderr, /buglist/);
  assert.match(r.stdout, /"phase": "bugfix"/);
});

test('G1: route task con chưa có buglist → in ask + câu hỏi; run từ chối', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-data-'));
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify({ issues: { 'GW-1': { phase: 'wait-test' }, 'GW-2': { parent: 'GW-1', phase: 'wait-test' } } }));
  const env = { ...process.env, AUTOPILOT_DATA_ROOT: data, AUTOPILOT_RUNS_DIR: path.join(data, 'runs') };
  const r = spawnSync(process.execPath, [CLI, 'route', 'GW-2'], { env, encoding: 'utf8' });
  assert.match(r.stdout, /^ask — task con của GW-1/);
  assert.match(r.stdout, /1\. Link buglist/);
  const run = spawnSync(process.execPath, [CLI, 'run', 'GW-2'], { env, encoding: 'utf8' });
  assert.strictEqual(run.status, 1);
  assert.match(run.stderr, /Kế thừa paths của GW-1/);
});

test('G5: design-intake không đụng repo — không tạo worktree, không giữ campaign', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-12', '--flow', 'design-intake', '--campaign', campaign);
  const run = lastRun(runs, 'GW-12');
  assert.deepStrictEqual([run.stage, run.repo, run.campaignDir, run.worktrees], ['pm-block', null, null, {}]);
});

const lockRun = (runs, run, pid) => fs.writeFileSync(path.join(runs, '.lock-run'), JSON.stringify({ pid, key: run.key, runId: run.runId }));

test('pause: chỉ nhận run đang chạy có process giữ; ghi .pause, không đụng run.json', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-6', '--flow', 'landing-fix', '--campaign', campaign);
  const waiting = lastRun(runs, 'GW-6');
  const runJson = path.join(runs, 'GW-6', waiting.runId, 'run.json');
  const marker = path.join(runs, 'GW-6', waiting.runId, '.pause');
  assert.strictEqual(cli('pause', 'GW-6').code, 1);

  fs.writeFileSync(runJson, JSON.stringify({ ...waiting, status: 'running', stage: 'implement' }));
  assert.match(cli('pause', 'GW-6').out, /bị ngắt/);
  assert.strictEqual(fs.existsSync(marker), false);

  lockRun(runs, waiting, process.pid);
  const before = fs.readFileSync(runJson, 'utf8');
  const r = cli('pause', 'GW-6');
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /implement/);
  assert.ok(fs.existsSync(marker));
  assert.strictEqual(fs.readFileSync(runJson, 'utf8'), before);
});

test('pause rồi resume: dừng trước stage kế, resume chạy tiếp đúng stage, budget giữ nguyên', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-7', '--flow', 'landing-fix', '--campaign', campaign);
  const waiting = lastRun(runs, 'GW-7');
  fs.writeFileSync(path.join(runs, 'GW-7', waiting.runId, '.pause'), '');
  cli('approve', 'GW-7');
  const paused = lastRun(runs, 'GW-7');
  assert.deepStrictEqual([paused.status, paused.stopReason, paused.stage], ['stopped', 'paused', 'implement']);
  assert.match(cli('status').out, /stopped \(paused\)/);

  cli('resume', 'GW-7');
  const after = lastRun(runs, 'GW-7');
  assert.strictEqual(after.receipts.at(paused.receipts.length).stage, 'implement');
  assert.deepStrictEqual(after.budget, paused.budget);
  assert.strictEqual(after.status, 'paused');
});

test('pause/abort tắt ngay tiến trình claude đang chạy của run', async () => {
  for (const action of ['pause', 'abort']) {
    const { cli, campaign, runs } = sandbox();
    cli('run', 'GW-8', '--flow', 'landing-fix', '--campaign', campaign);
    const waiting = lastRun(runs, 'GW-8');
    const dir = path.join(runs, 'GW-8', waiting.runId);
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ ...waiting, status: 'running', stage: 'implement' }));
    lockRun(runs, waiting, process.pid);
    const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    fs.writeFileSync(path.join(dir, '.child'), JSON.stringify({ pid: child.pid }));
    const exited = new Promise((resolve) => child.on('exit', (_, signal) => resolve(signal)));
    assert.strictEqual(cli(action, 'GW-8').code, 0);
    assert.strictEqual(await Promise.race([exited, new Promise((r) => setTimeout(() => r('vẫn sống'), 2000))]), 'SIGTERM', `${action} phải tắt PID ${child.pid}`);
  }
});
