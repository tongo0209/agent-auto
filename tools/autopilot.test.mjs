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
    assert.deepStrictEqual(fs.readdirSync(runs).filter((f) => f.startsWith('.lock-run')), []);
  });
}

test('buglist: chưa bật AUTOPILOT_LAB_WRITES → bỏ write-sheet, approve kết quả là done', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-2', '--flow', 'buglist', '--campaign', campaign);
  cli('approve', 'GW-2');
  const run = lastRun(runs, 'GW-2');
  assert.strictEqual(run.status, 'done');
  assert.deepStrictEqual([run.worktrees, Object.keys(run.workBranch)], [{}, [path.resolve(campaign, '../../../..')]]);
});

test('plan-review revise 4 lần → stopped loop-exhausted, status báo lý do', () => {
  const { cli, campaign } = sandbox({ 'plan-review': [{ result: verdict('revise', { blocking: ['thiếu tab'] }) }] });
  cli('run', 'GW-3', '--flow', 'landing-fix', '--campaign', campaign);
  const status = cli('status', 'GW-3');
  assert.match(status.out, /stopped \(loop-exhausted:plan-review\)/);
  assert.match(status.out, /Tổng: 8 lượt claude/);
});

test('reject có note → plan vòng sau nhận note rồi xoá (note dùng 1 lần)', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-4', '--flow', 'landing-fix', '--campaign', campaign);
  cli('reject', 'GW-4', '--note', 'thêm trạng thái đã nhận');
  const run = lastRun(runs, 'GW-4');
  assert.strictEqual(run.rejectNote, null);
  assert.strictEqual(run.receipts.filter((r) => r.stage === 'plan').at(-1).round, 2);
  assert.strictEqual(run.stage, 'approve-plan');
});

test('run khác đang có process chạy không chặn run mới; chính run đó đang chạy thì resume bị từ chối', () => {
  const { cli, campaign, runs } = sandbox();
  fs.mkdirSync(runs, { recursive: true });
  fs.writeFileSync(path.join(runs, '.lock-run-GW-9-x'), JSON.stringify({ pid: process.pid, key: 'GW-9', runId: 'x' }));
  assert.strictEqual(cli('run', 'GW-5', '--flow', 'landing-fix', '--campaign', campaign).code, 0);
  const run = lastRun(runs, 'GW-5');
  lockRun(runs, run, process.pid);
  const r = cli('approve', 'GW-5');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /process khác/);
});

test('resume sau loop-exhausted chạy tiếp', () => {
  const { cli, campaign, runs } = sandbox({ 'plan-review': [{ result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('pass') }] });
  cli('run', 'GW-6', '--flow', 'landing-fix', '--campaign', campaign);
  assert.strictEqual(lastRun(runs, 'GW-6').status, 'stopped');
  cli('resume', 'GW-6');
  assert.strictEqual(lastRun(runs, 'GW-6').stage, 'approve-plan');
});

test('R19 abort: nhả campaign + repo, xoá thư mục run; không đụng repo gốc, in file run đổi chưa commit (bỏ file dở có từ trước)', () => {
  const { cli, campaign, runs } = sandbox();
  const repo = path.resolve(campaign, '../../../..');
  fs.writeFileSync(path.join(repo, 'cu.txt'), 'dở từ trước');
  cli('run', 'GW-7', '--flow', 'landing-fix', '--campaign', campaign);
  fs.writeFileSync(path.join(campaign, 'run-sua.html'), '<p>run</p>');
  const r = cli('abort', 'GW-7');
  assert.strictEqual(r.code, 0, r.out);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8')), {});
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(runs, '.repos.json'), 'utf8')), {});
  assert.strictEqual(fs.existsSync(path.join(runs, 'GW-7')), false, 'thư mục task rỗng cũng phải xoá');
  assert.ok(fs.existsSync(path.join(campaign, 'run-sua.html')) && fs.existsSync(path.join(repo, 'cu.txt')));
  assert.match(r.out, /products\/x\/landing\/a\/run-sua\.html/);
  assert.doesNotMatch(r.out, /cu\.txt/);
});

test('2 run cùng repo khác campaign → chạy song song, cả 2 tới mốc duyệt plan', () => {
  const { cli, campaign, runs } = sandbox();
  const other = path.join(campaign, '../b');
  fs.mkdirSync(other);
  cli('run', 'GW-8', '--flow', 'landing-fix', '--campaign', campaign);
  cli('run', 'GW-9', '--flow', 'landing-fix', '--campaign', other);
  assert.deepStrictEqual([lastRun(runs, 'GW-8').stage, lastRun(runs, 'GW-9').stage], ['approve-plan', 'approve-plan']);
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

const lockRun = (runs, run, pid) => fs.writeFileSync(path.join(runs, `.lock-run-${run.key}-${run.runId}`), JSON.stringify({ pid, key: run.key, runId: run.runId }));

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

test('R19 open: tạo run chat làm thẳng trên repo gốc + brief.md, in JSON để UI mở tab', () => {
  const { launch, runs, campaign } = openChat();
  const run = lastRun(runs, 'GW-20');
  assert.deepStrictEqual([run.mode, run.status, run.stage, run.worktrees], ['chat', 'chat', 'plan', {}]);
  const repo = path.resolve(campaign, '../../../..');
  assert.deepStrictEqual(Object.keys(run.workBranch), [repo]);
  assert.strictEqual(launch.cwd, path.dirname(campaign));
  assert.ok(fs.existsSync(launch.cwd));
  assert.deepStrictEqual(launch.env, { AUTOPILOT_RUN: `GW-20/${run.runId}` });
  assert.ok(launch.args.includes('--settings'));
  const brief = path.join(runs, 'GW-20', run.runId, 'brief.md');
  assert.match(launch.args[0], new RegExp(brief.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const text = fs.readFileSync(brief, 'utf8');
  for (const stage of ['plan', 'approve-plan', 'implement', 'gates', 'commit']) assert.match(text, new RegExp(`\\*\\*${stage}\\*\\*`));
  assert.match(text, /autopilot\.mjs mark GW-20 <bước> <doing\|pass\|fail\|ask>/);
  assert.match(text, /autopilot\.mjs gates GW-20/);
  assert.ok(text.includes(`campaignDir: \`${campaign}\``));
  assert.ok(launch.args.some((a) => a.includes(`sandbox-hook.mjs\\" \\"${repo}`)));
  assert.strictEqual(Object.values(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8')))[0].key, 'GW-20');
  assert.ok(campaign);
});

test('open --attach run chat: nối phiên claude mới nhất của worktree; chưa có phiên thì mở lại bằng brief', () => {
  const { cli, launch, projects } = openChat();
  assert.strictEqual(JSON.parse(cli('open', 'GW-20', '--attach').out).args[0], launch.args[0]);
  const dir = path.join(projects, launch.cwd.replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'cu.jsonl'), '{}\n');
  fs.utimesSync(path.join(dir, 'cu.jsonl'), new Date(2020, 1, 1), new Date(2020, 1, 1));
  fs.writeFileSync(path.join(dir, 'moi.jsonl'), '{}\n');
  const resumed = JSON.parse(cli('open', 'GW-20', '--attach').out);
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

test('done: run chat xong, nhả campaign + repo, repo vẫn nguyên', () => {
  const { cli, runs, launch } = openChat();
  assert.strictEqual(cli('done', 'GW-20').code, 0);
  const run = lastRun(runs, 'GW-20');
  assert.deepStrictEqual([run.status, run.stage], ['done', null]);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8')), {});
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(runs, '.repos.json'), 'utf8')), {});
  assert.ok(fs.existsSync(launch.cwd));
});

test('R19 abort run chat: xoá thư mục run, repo gốc giữ nguyên', () => {
  const { cli, runs, launch } = openChat();
  assert.strictEqual(cli('abort', 'GW-20').code, 0);
  assert.ok(fs.existsSync(path.join(launch.cwd, 'a/index.html')));
  assert.strictEqual(fs.existsSync(path.join(runs, 'GW-20')), false);
});

function doneRun(key) {
  const box = sandbox();
  box.cli('run', key, '--flow', 'landing-fix', '--campaign', box.campaign);
  for (let i = 0; i < 5 && lastRun(box.runs, key).status === 'paused'; i++) box.cli('approve', key);
  assert.strictEqual(lastRun(box.runs, key).status, 'done');
  return box;
}

test('reviewed: chỉ nhận run done, ghi reviewedAt', () => {
  const { cli, runs, campaign } = doneRun('GW-30');
  assert.strictEqual(cli('reviewed', 'GW-30').code, 0);
  assert.ok(lastRun(runs, 'GW-30').reviewedAt > 0);
  cli('run', 'GW-31', '--flow', 'landing-fix', '--campaign', campaign);
  assert.match(cli('reviewed', 'GW-31').out, /chưa xong/);
});

test('reject run done: mở lại ở fix với note, chạy lại tới commit trên cùng worktree, giữ lại campaign khi chạy', () => {
  const { cli, runs } = doneRun('GW-32');
  const before = lastRun(runs, 'GW-32');
  cli('reviewed', 'GW-32');
  const r = cli('reject', 'GW-32', '--note', 'nút lệch 4px');
  assert.strictEqual(r.code, 0, r.out);
  const run = lastRun(runs, 'GW-32');
  assert.deepStrictEqual([run.runId, run.status, run.rejectNote, run.reviewedAt], [before.runId, 'done', null, null]);
  assert.deepStrictEqual(run.receipts.slice(before.receipts.length).map((x) => x.stage), ['fix', 'gates', 'ui-check', 'commit']);
  assert.deepStrictEqual(run.worktrees, before.worktrees);
  assert.match(cli('reject', 'GW-32').out, /--note/);
});

test('reject run done khi campaign đang bị run khác giữ → từ chối', () => {
  const { cli, runs, campaign } = doneRun('GW-33');
  fs.writeFileSync(path.join(runs, '.held.json'), JSON.stringify({ [campaign]: { key: 'GW-99', runId: 'x' } }));
  fs.mkdirSync(path.join(runs, 'GW-99', 'x'), { recursive: true });
  fs.writeFileSync(path.join(runs, 'GW-99', 'x', 'run.json'), JSON.stringify({ key: 'GW-99', runId: 'x', status: 'paused' }));
  const r = cli('reject', 'GW-33', '--note', 'x');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /GW-99/);
  assert.strictEqual(lastRun(runs, 'GW-33').status, 'done');
});

test('open --followup: chat tiếp trên repo của run done, brief kèm thay đổi + lời nhắn', () => {
  const { cli, runs, campaign } = doneRun('GW-34');
  const before = lastRun(runs, 'GW-34');
  const r = cli('open', 'GW-34', '--followup', '--note', 'đổi màu nút');
  assert.strictEqual(r.code, 0, r.out);
  const launch = JSON.parse(r.out);
  const run = lastRun(runs, 'GW-34');
  assert.deepStrictEqual([run.runId, run.mode, run.status, run.stage, run.worktrees], [before.runId, 'chat', 'chat', 'fix', before.worktrees]);
  assert.strictEqual(launch.cwd, before.repo);
  const brief = fs.readFileSync(path.join(runs, 'GW-34', run.runId, 'brief.md'), 'utf8');
  assert.match(brief, /đổi màu nút/);
  assert.ok(brief.includes(`nhánh \`${Object.values(before.workBranch)[0]}\``));
  assert.match(brief, /autopilot\.mjs gates GW-34 commit/);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8'))[campaign].key, 'GW-34');
  assert.match(cli('open', 'GW-34', '--followup').out, /chưa xong/);
});

const attach = (cli, runs, key) => {
  const r = cli('open', key, '--attach');
  assert.strictEqual(r.code, 0, r.out);
  const launch = JSON.parse(r.out);
  const run = lastRun(runs, key);
  const brief = path.join(runs, key, run.runId, 'attach.md');
  assert.ok(launch.args[0].includes(brief));
  assert.ok(launch.args.includes('--settings'));
  return { launch, run, brief: fs.readFileSync(brief, 'utf8') };
};

test('open --attach run done: không đổi run, phiên mới trên repo, brief có trạng thái + lượt + nhánh + artifact + lệnh dùng được + luật source', () => {
  const { cli, runs } = doneRun('GW-35');
  const before = lastRun(runs, 'GW-35');
  const { launch, run, brief } = attach(cli, runs, 'GW-35');
  assert.deepStrictEqual(run, before);
  assert.strictEqual(launch.cwd, before.repo);
  assert.deepStrictEqual(launch.env, { AUTOPILOT_RUN: `GW-35/${run.runId}` });
  assert.match(brief, /done/);
  assert.match(brief, /commit · vòng 1 · pass/);
  assert.ok(brief.includes(`nhánh \`${Object.values(before.workBranch)[0]}\``));
  assert.match(brief, /gates-r1\.json/);
  for (const cmd of ['reviewed GW-35', 'reject GW-35 --note', 'open GW-35 --followup', 'abort GW-35', 'status GW-35']) assert.ok(brief.includes(cmd), cmd);
  for (const cmd of ['pause GW-35', 'resume GW-35', 'approve GW-35']) assert.ok(!brief.includes(cmd), cmd);
  assert.match(brief, /KHÔNG tự push/);
});

test('open --attach run dừng / chờ duyệt: lệnh theo trạng thái, kèm lý do dừng', () => {
  const stopped = sandbox({ 'plan-review': [{ result: verdict('revise', { blocking: ['thiếu tab'] }) }] });
  stopped.cli('run', 'GW-36', '--flow', 'landing-fix', '--campaign', stopped.campaign);
  const { brief } = attach(stopped.cli, stopped.runs, 'GW-36');
  assert.match(brief, /loop-exhausted:plan-review/);
  assert.ok(brief.includes('resume GW-36 [--note'));
  assert.ok(!brief.includes('reviewed GW-36'));

  const paused = sandbox();
  paused.cli('run', 'GW-37', '--flow', 'landing-fix', '--campaign', paused.campaign);
  const waiting = attach(paused.cli, paused.runs, 'GW-37').brief;
  assert.ok(waiting.includes('approve GW-37') && waiting.includes('reject GW-37 --note'));
  assert.strictEqual(lastRun(paused.runs, 'GW-37').status, 'paused');
});

test('open --attach run chưa có: báo lỗi', () => {
  const { cli } = sandbox();
  assert.match(cli('open', 'GW-404', '--attach').out, /Chưa có run/);
});

test('route --json: landing-fix trả stages có gateLike, when + predicted; --flow ghi lý do chọn tay', () => {
  const { cli, campaign } = sandbox();
  const r = cli('route', 'GW-30', '--json', '--flow', 'landing-fix', '--campaign', campaign);
  assert.strictEqual(r.code, 0, r.out);
  const preview = JSON.parse(r.out);
  assert.strictEqual(preview.flow, 'landing-fix');
  assert.strictEqual(preview.reason, 'chọn tay --flow landing-fix');
  assert.ok(preview.flows.some((f) => f.id === 'buglist' && f.label));
  const byId = Object.fromEntries(preview.stages.map((s) => [s.id, s]));
  assert.deepStrictEqual([byId.gates.gateLike, byId['ui-check'].gateLike, byId.plan.gateLike], [true, true, false]);
  assert.deepStrictEqual([byId.plan.predicted, byId.handoff.when, byId.handoff.predicted], ['run', 'hasHandoff', 'skip']);
});

test('route --json khi router dừng hỏi → flow null kèm lý do, exit 0', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-data-'));
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify({ issues: { 'GW-1': { phase: 'wait-test' }, 'GW-2': { parent: 'GW-1', phase: 'wait-test' } } }));
  const r = spawnSync(process.execPath, [CLI, 'route', 'GW-2', '--json'], { env: { ...process.env, AUTOPILOT_DATA_ROOT: data }, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const preview = JSON.parse(r.stdout);
  assert.strictEqual(preview.flow, null);
  assert.match(preview.reason, /task con của GW-1/);
});

test('run --skip stage lạ / mốc duyệt / gate thiếu lý do → exit≠0, chưa tạo run', () => {
  const { cli, campaign, runs } = sandbox();
  const ghost = cli('run', 'GW-30', '--flow', 'landing-fix', '--campaign', campaign, '--skip', 'ghost');
  assert.notStrictEqual(ghost.code, 0);
  assert.match(ghost.out, /không có stage ghost trong luồng landing-fix/);
  assert.match(cli('run', 'GW-30', '--flow', 'landing-fix', '--campaign', campaign, '--skip', 'approve-plan').out, /không tắt được mốc duyệt approve-plan/);
  assert.notStrictEqual(cli('run', 'GW-30', '--flow', 'landing-fix', '--campaign', campaign, '--skip', 'gates').code, 0);
  assert.notStrictEqual(cli('run', 'GW-30', '--flow', 'landing-fix', '--campaign', campaign, '--skip', 'gates', '--skip-reason', ' ').code, 0);
  assert.match(cli('run', 'GW-30', '--flow', 'landing-fix', '--campaign', campaign, '--break', 'ghost').out, /không có stage ghost/);
  assert.strictEqual(fs.existsSync(path.join(runs, 'GW-30')), false);
});

test('run --skip gates có lý do → bỏ gates; --break implement → dừng breakpoint, resume tới approve-result', () => {
  const { cli, campaign, runs } = sandbox();
  assert.strictEqual(cli('run', 'GW-31', '--flow', 'landing-fix', '--campaign', campaign, '--skip', 'gates', '--skip-reason', 'đã chạy tay', '--break', 'implement').code, 0);
  assert.deepStrictEqual(lastRun(runs, 'GW-31').plan, { disabled: ['gates'], breakpoints: ['implement'], skipReason: 'đã chạy tay' });
  cli('approve', 'GW-31');
  const halted = lastRun(runs, 'GW-31');
  assert.deepStrictEqual([halted.status, halted.stopReason], ['stopped', 'breakpoint:implement']);
  cli('resume', 'GW-31');
  const after = lastRun(runs, 'GW-31');
  assert.deepStrictEqual([after.status, after.stage], ['paused', 'approve-result']);
  assert.strictEqual(after.receipts.find((r) => r.stage === 'gates').verdict, 'skipped-by-user');
});

test('goto plan ở approve-plan cần --note; có note → plan chạy vòng 2 mang note', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-32', '--flow', 'landing-fix', '--campaign', campaign);
  assert.notStrictEqual(cli('goto', 'GW-32', 'plan').code, 0);
  assert.strictEqual(cli('goto', 'GW-32', 'plan', '--note', 'thêm tab').code, 0);
  const run = lastRun(runs, 'GW-32');
  assert.deepStrictEqual([run.status, run.stage, run.rejectNote], ['paused', 'approve-plan', null]);
  assert.strictEqual(run.receipts.filter((r) => r.stage === 'plan').at(-1).round, 2);
});

test('goto stage chưa đi qua → exit≠0 "chưa đi qua"', () => {
  const { cli, campaign } = sandbox();
  cli('run', 'GW-33', '--flow', 'landing-fix', '--campaign', campaign);
  const r = cli('goto', 'GW-33', 'approve-result', '--note', 'x');
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /chưa đi qua/);
});

const stopAt = (runs, key, stage, stopReason) => {
  const run = lastRun(runs, key);
  fs.writeFileSync(path.join(runs, key, run.runId, 'run.json'), JSON.stringify({ ...run, status: 'stopped', stage, stopReason }));
};

test('skip gates sau khi gates fail: thiếu --reason → exit≠0; có → gateSkipped, chạy tiếp', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-34', '--flow', 'landing-fix', '--campaign', campaign);
  cli('approve', 'GW-34');
  stopAt(runs, 'GW-34', 'gates', 'loop-exhausted:gates');
  assert.match(cli('skip', 'GW-34').out, /cần lý do/);
  assert.strictEqual(cli('skip', 'GW-34', '--reason', 'build lỗi môi trường').code, 0);
  const run = lastRun(runs, 'GW-34');
  assert.deepStrictEqual(run.gateSkipped.map((g) => [g.stage, g.reason]), [['gates', 'build lỗi môi trường']]);
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'approve-result']);
});

test('pick B khi plan.md có A/B → choice B, chạy tới approve-result', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-35', '--flow', 'landing-fix', '--campaign', campaign);
  assert.notStrictEqual(cli('pick', 'GW-35', 'B').code, 0, 'chưa có plan.md thì không có phương án');
  fs.writeFileSync(path.join(runs, 'GW-35', lastRun(runs, 'GW-35').runId, 'plan.md'), '## Phương án\n### A · Một\nx\n### B · Hai\ny\n');
  assert.strictEqual(cli('pick', 'GW-35', 'B', '--note', 'gọn hơn').code, 0);
  const run = lastRun(runs, 'GW-35');
  assert.deepStrictEqual(run.choice, { id: 'B', title: 'Hai', note: 'gọn hơn' });
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'approve-result']);
});

test('retry sau loop-exhausted:plan-review → chạy lại plan-review', () => {
  const { cli, campaign, runs } = sandbox({ 'plan-review': [{ result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('pass') }] });
  cli('run', 'GW-36', '--flow', 'landing-fix', '--campaign', campaign);
  const stopped = lastRun(runs, 'GW-36');
  assert.strictEqual(stopped.stopReason, 'loop-exhausted:plan-review');
  assert.strictEqual(cli('retry', 'GW-36').code, 0);
  const run = lastRun(runs, 'GW-36');
  assert.strictEqual(run.receipts.at(stopped.receipts.length).stage, 'plan-review');
  assert.deepStrictEqual([run.status, run.stage], ['paused', 'approve-plan']);
});

test('retry --bg trả lời ngay rồi chạy nền tới mốc dừng kế', async () => {
  const { cli, campaign, runs } = sandbox({ 'plan-review': [{ result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('revise', { blocking: ['x'] }) }, { result: verdict('pass') }] });
  cli('run', 'GW-38', '--flow', 'landing-fix', '--campaign', campaign);
  const r = cli('retry', 'GW-38', '--bg');
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /Chạy nền PID/);
  for (let i = 0; i < 100 && lastRun(runs, 'GW-38').stage !== 'approve-plan'; i++) await new Promise((ok) => setTimeout(ok, 100));
  assert.deepStrictEqual([lastRun(runs, 'GW-38').status, lastRun(runs, 'GW-38').stage], ['paused', 'approve-plan']);
});

test('break bật/tắt điểm dừng không chạy run; --off tắt; run done → từ chối', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-37', '--flow', 'landing-fix', '--campaign', campaign);
  assert.strictEqual(cli('break', 'GW-37', 'code-review').code, 0);
  assert.deepStrictEqual(lastRun(runs, 'GW-37').plan.breakpoints, ['code-review']);
  assert.strictEqual(lastRun(runs, 'GW-37').stage, 'approve-plan');
  cli('break', 'GW-37', 'code-review');
  assert.deepStrictEqual(lastRun(runs, 'GW-37').plan.breakpoints, ['code-review']);
  cli('break', 'GW-37', 'code-review', '--off');
  assert.deepStrictEqual(lastRun(runs, 'GW-37').plan.breakpoints, []);
  assert.match(cli('break', 'GW-37', 'ghost').out, /không có stage ghost/);
  cli('approve', 'GW-37');
  cli('approve', 'GW-37');
  assert.strictEqual(lastRun(runs, 'GW-37').status, 'done');
  assert.notStrictEqual(cli('break', 'GW-37', 'commit').code, 0);
  assert.notStrictEqual(cli('break', 'GW-37', 'commit', '--off').code, 0, 'run done: từ chối cả khi không đổi gì');
});

test('break không đổi gì (--off ở stage chưa có điểm dừng) → không ghi run.json', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-40', '--flow', 'landing-fix', '--campaign', campaign);
  const file = path.join(runs, 'GW-40', lastRun(runs, 'GW-40').runId, 'run.json');
  fs.writeFileSync(file, JSON.stringify(lastRun(runs, 'GW-40')));
  const before = fs.readFileSync(file, 'utf8');
  assert.strictEqual(cli('break', 'GW-40', 'code-review', '--off').code, 0);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before);
});

test('run bị ngắt (running, không process giữ lock) → retry chạy lại stage, không cần resume', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-41', '--flow', 'landing-fix', '--campaign', campaign);
  const run = lastRun(runs, 'GW-41');
  fs.writeFileSync(path.join(runs, 'GW-41', run.runId, 'run.json'), JSON.stringify({ ...run, status: 'running', stage: 'plan-review' }));
  const r = cli('retry', 'GW-41');
  assert.strictEqual(r.code, 0, r.out);
  const after = lastRun(runs, 'GW-41');
  assert.deepStrictEqual([after.status, after.stage, after.receipts.length], ['paused', 'approve-plan', run.receipts.length + 1]);
});

test('approve khi run đã bỏ cổng → in cảnh báo số cổng + tên + lý do', () => {
  const { cli, campaign } = sandbox();
  cli('run', 'GW-42', '--flow', 'landing-fix', '--campaign', campaign, '--skip', 'gates', '--skip-reason', 'build hỏng sẵn');
  cli('approve', 'GW-42');
  assert.match(cli('approve', 'GW-42').out, /Đã bỏ 1 cổng: gates \(build hỏng sẵn\)/);
});

const overBudgetAt = (runs, key, stage) => {
  const run = lastRun(runs, key);
  fs.writeFileSync(path.join(runs, key, run.runId, 'run.json'), JSON.stringify({ ...run, status: 'stopped', stage, stopReason: 'budget', budget: { usd: -1 } }));
};

test('run dừng vì budget: skip/retry bỏ trần cũ, chạy tới mốc dừng kế', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-38', '--flow', 'landing-fix', '--campaign', campaign);
  overBudgetAt(runs, 'GW-38', 'plan-review');
  assert.strictEqual(cli('retry', 'GW-38').code, 0);
  assert.deepStrictEqual([lastRun(runs, 'GW-38').status, lastRun(runs, 'GW-38').stage], ['paused', 'approve-plan']);
  cli('approve', 'GW-38');
  overBudgetAt(runs, 'GW-38', 'gates');
  assert.strictEqual(cli('skip', 'GW-38', '--reason', 'x').code, 0);
  assert.deepStrictEqual([lastRun(runs, 'GW-38').status, lastRun(runs, 'GW-38').stage], ['paused', 'approve-result']);
});

test('run --break mốc duyệt → từ chối; route --json --flow lạ → báo flow không có', () => {
  const { cli, campaign, runs } = sandbox();
  assert.match(cli('run', 'GW-39', '--flow', 'landing-fix', '--campaign', campaign, '--break', 'approve-plan').out, /mốc duyệt approve-plan/);
  assert.strictEqual(fs.existsSync(path.join(runs, 'GW-39')), false);
  const r = cli('route', 'GW-39', '--json', '--flow', 'ghost', '--campaign', campaign);
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /flow không có: ghost/);
});

test('run chụp Jira vào jira.json: đổi sau lần quét cuối → cảnh báo + đưa vào run; lỗi gọi Jira không chặn run', () => {
  const { campaign, runs } = sandbox();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-data-'));
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify({ issues: { 'GW-50': { lastSeenUpdated: '2026-10-21T10:14:00.000+0700' } } }));
  const jira = path.join(data, 'jira.json');
  fs.writeFileSync(jira, JSON.stringify({ key: 'GW-50', updated: '2026-10-21T10:47:12.000+0700', description: 'mới' }));
  const env = { ...process.env, AUTOPILOT_RUNS_DIR: runs, AUTOPILOT_DATA_ROOT: data, AUTOPILOT_FAKE: path.join(data, 'none.json'), AUTOPILOT_FAKE_GATES: 'pass', AUTOPILOT_NO_NOTIFY: '1' };
  fs.writeFileSync(env.AUTOPILOT_FAKE, '{}');
  const cli = (key, fakeJira, dir = campaign) => spawnSync(process.execPath, [CLI, 'run', key, '--flow', 'landing-fix', '--campaign', dir], { env: { ...env, AUTOPILOT_FAKE_JIRA: fakeJira }, encoding: 'utf8' });

  const changed = cli('GW-50', jira);
  assert.match(changed.stdout, /Jira đổi sau lần quét cuối/);
  const run = lastRun(runs, 'GW-50');
  assert.strictEqual(run.jiraUpdate.description, 'mới');
  assert.ok(fs.existsSync(path.join(runs, 'GW-50', run.runId, 'jira.json')));

  const broken = cli('GW-51', path.join(data, 'missing.json'), sandbox().campaign);
  assert.match(broken.stdout + broken.stderr, /không đọc được Jira/);
  assert.strictEqual(lastRun(runs, 'GW-51').jiraUpdate, undefined);
});
