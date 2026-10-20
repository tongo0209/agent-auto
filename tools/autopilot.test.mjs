import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const CLI = path.join(import.meta.dirname, 'autopilot.mjs');
const verdict = (v, extra = {}) => '```autopilot-verdict\n' + JSON.stringify({ verdict: v, ...extra }) + '\n```';

function sandbox(fakeScript = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-cli-')));
  const campaign = path.join(root, 'repo/products/x/landing/a');
  fs.mkdirSync(campaign, { recursive: true });
  const git = (...args) => spawnSync('git', args, { cwd: path.join(root, 'repo'), encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  const fake = path.join(root, 'fake.json');
  fs.writeFileSync(fake, JSON.stringify(fakeScript));
  const env = { ...process.env, AUTOPILOT_RUNS_DIR: path.join(root, 'runs'), AUTOPILOT_FAKE: fake, AUTOPILOT_FAKE_GATES: 'pass', AUTOPILOT_NO_NOTIFY: '1', AUTOPILOT_CLAUDE_PROJECTS: path.join(root, 'projects') };
  const cli = (...args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  return { cli, campaign, runs: env.AUTOPILOT_RUNS_DIR, projects: env.AUTOPILOT_CLAUDE_PROJECTS };
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

function openChat(key = 'GW-20') {
  const box = sandbox();
  fs.writeFileSync(path.join(box.campaign, 'index.html'), '<p>x</p>');
  const repo = path.resolve(box.campaign, '../../../..');
  spawnSync('git', ['-C', repo, 'add', '.'], { encoding: 'utf8' });
  spawnSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'campaign'], { encoding: 'utf8' });
  const r = box.cli('open', key, '--flow', 'landing-fix', '--campaign', box.campaign);
  assert.strictEqual(r.code, 0, r.out);
  return { ...box, launch: JSON.parse(r.out) };
}

test('open: tạo run chat + worktree + brief.md, in JSON để UI mở tab', () => {
  const { launch, runs, campaign } = openChat();
  const run = lastRun(runs, 'GW-20');
  assert.deepStrictEqual([run.mode, run.status, run.stage], ['chat', 'chat', 'plan']);
  const wt = Object.values(run.worktrees)[0];
  assert.ok(wt.startsWith(path.join(runs, 'GW-20', run.runId, 'wt')));
  assert.strictEqual(launch.cwd, path.join(wt, 'products/x/landing'));
  assert.ok(fs.existsSync(launch.cwd));
  assert.deepStrictEqual(launch.env, { AUTOPILOT_RUN: `GW-20/${run.runId}` });
  assert.ok(launch.args.includes('--settings'));
  const brief = path.join(runs, 'GW-20', run.runId, 'brief.md');
  assert.match(launch.args[0], new RegExp(brief.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const text = fs.readFileSync(brief, 'utf8');
  for (const stage of ['plan', 'approve-plan', 'implement', 'gates', 'commit']) assert.match(text, new RegExp(`\\*\\*${stage}\\*\\*`));
  assert.match(text, /autopilot\.mjs mark GW-20 <bước> <doing\|pass\|fail\|ask>/);
  assert.match(text, /autopilot\.mjs gates GW-20/);
  assert.ok(text.includes(`campaignDir: \`${wt}/products/x/landing/a\``));
  assert.strictEqual(Object.values(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8')))[0].key, 'GW-20');
  assert.ok(campaign);
});

test('open --resume: nối phiên claude mới nhất của worktree; chưa có phiên thì mở lại bằng brief', () => {
  const { cli, launch, projects } = openChat();
  assert.strictEqual(JSON.parse(cli('open', 'GW-20', '--resume').out).args[0], launch.args[0]);
  const dir = path.join(projects, launch.cwd.replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'cu.jsonl'), '{}\n');
  fs.utimesSync(path.join(dir, 'cu.jsonl'), new Date(2020, 1, 1), new Date(2020, 1, 1));
  fs.writeFileSync(path.join(dir, 'moi.jsonl'), '{}\n');
  const resumed = JSON.parse(cli('open', 'GW-20', '--resume').out);
  assert.deepStrictEqual(resumed.args.slice(0, 2), ['--resume', 'moi']);
  assert.strictEqual(resumed.cwd, launch.cwd);
});

test('mark: cập nhật stage + trạng thái; pass/fail thêm receipt; chặn bước/trạng thái lạ', () => {
  const { cli, runs } = openChat();
  assert.strictEqual(cli('mark', 'GW-20', 'plan', 'doing').code, 0);
  assert.strictEqual(cli('mark', 'GW-20', 'plan', 'pass', '--note', 'plan xong').code, 0);
  assert.strictEqual(cli('mark', 'GW-20', 'approve-plan', 'ask', '--note', 'chọn tab nào?').code, 0);
  const run = lastRun(runs, 'GW-20');
  assert.deepStrictEqual([run.stage, run.chatState, run.chatNote], ['approve-plan', 'ask', 'chọn tab nào?']);
  assert.deepStrictEqual(run.receipts.map((r) => [r.stage, r.verdict, r.note, r.round]), [['plan', 'pass', 'plan xong', 1]]);
  assert.match(cli('mark', 'GW-20', 'khong-co', 'pass').out, /Bước lạ/);
  assert.strictEqual(cli('mark', 'GW-20', 'plan', 'xong').code, 1);
});

test('mark/gates/done chỉ nhận run chat', () => {
  const { cli, campaign } = sandbox();
  cli('run', 'GW-21', '--flow', 'landing-fix', '--campaign', campaign);
  for (const args of [['mark', 'GW-21', 'plan', 'pass'], ['gates', 'GW-21'], ['done', 'GW-21']]) assert.match(cli(...args).out, /không phải run chat/);
});

test('gates: chạy cổng của luồng trên worktree, ghi artifact + receipt; mặc định bỏ commit', () => {
  const { cli, runs } = openChat();
  const r = cli('gates', 'GW-20');
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /gates: ĐẠT/);
  assert.match(r.out, /layout-gate pass/);
  assert.doesNotMatch(r.out, /commit/);
  const run = lastRun(runs, 'GW-20');
  assert.deepStrictEqual(run.receipts.map((x) => [x.stage, x.verdict]), [['gates', 'pass']]);
  assert.ok(fs.existsSync(path.join(runs, 'GW-20', run.runId, 'gates-r1.json')));
  assert.strictEqual(run.stage, 'plan');

  const only = cli('gates', 'GW-20', 'build');
  assert.match(only.out, /build pass/);
  assert.doesNotMatch(only.out, /pm-gate/);
  assert.ok(fs.existsSync(path.join(runs, 'GW-20', run.runId, 'gates-r2.json')));
  assert.match(cli('gates', 'GW-20', 'commit').out, /commit:/);
  assert.match(cli('gates', 'GW-20', 'xoa-het').out, /check lạ/);
});

test('done: run chat xong, nhả campaign, giữ worktree + nhánh để review', () => {
  const { cli, runs, launch } = openChat();
  assert.strictEqual(cli('done', 'GW-20').code, 0);
  const run = lastRun(runs, 'GW-20');
  assert.deepStrictEqual([run.status, run.stage], ['done', null]);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8')), {});
  assert.ok(fs.existsSync(launch.cwd));
});

test('abort run chat: dọn worktree + thư mục run như run tự động', () => {
  const { cli, runs, launch } = openChat();
  assert.strictEqual(cli('abort', 'GW-20').code, 0);
  assert.strictEqual(fs.existsSync(launch.cwd), false);
  assert.strictEqual(fs.existsSync(path.join(runs, 'GW-20')), false);
});
