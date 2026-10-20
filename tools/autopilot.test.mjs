import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = path.join(import.meta.dirname, 'autopilot.mjs');
const verdict = (v, extra = {}) => '```autopilot-verdict\n' + JSON.stringify({ verdict: v, ...extra }) + '\n```';

function sandbox(fakeScript = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-cli-'));
  const campaign = path.join(root, 'repo/products/x/landing/a');
  fs.mkdirSync(campaign, { recursive: true });
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

test('buglist: dừng ở write-sheet attached rồi approve → done', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-2', '--flow', 'buglist', '--campaign', campaign);
  cli('approve', 'GW-2');
  assert.strictEqual(lastRun(runs, 'GW-2').status, 'attached');
  cli('approve', 'GW-2');
  assert.strictEqual(lastRun(runs, 'GW-2').status, 'done');
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

test('abort nhả campaign', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-7', '--flow', 'landing-fix', '--campaign', campaign);
  cli('abort', 'GW-7');
  assert.strictEqual(lastRun(runs, 'GW-7').stopReason, 'aborted');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8')), {});
});

test('route --validate báo 4 luồng hợp lệ', () => {
  const { cli } = sandbox();
  const r = cli('route', '--validate');
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /4 luồng hợp lệ/);
});

test('run thứ 2 cùng campaign khi run trước còn giữ → từ chối, không ghi đè quyền giữ', () => {
  const { cli, campaign, runs } = sandbox();
  cli('run', 'GW-10', '--flow', 'landing-fix', '--campaign', campaign);
  const r = cli('run', 'GW-11', '--flow', 'landing-fix', '--campaign', campaign);
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /GW-10/);
  assert.deepStrictEqual(Object.values(JSON.parse(fs.readFileSync(path.join(runs, '.held.json'), 'utf8'))).map((o) => o.key), ['GW-10']);
});
