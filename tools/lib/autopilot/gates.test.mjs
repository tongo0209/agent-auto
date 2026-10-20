import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runGates } from './gates.mjs';

function fixture({ scripts = { 'build-dev': 'x', 'build-optimize': 'y' }, html = '<div class="pm__login"></div>' } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-gates-'));
  const campaignDir = path.join(repo, 'products/x/landing/a');
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(path.join(campaignDir, 'package.json'), JSON.stringify({ scripts }));
  fs.writeFileSync(path.join(campaignDir, 'index.html'), html);
  return { repo, campaignDir };
}

function fakeExec(codes = {}, porcelain = '') {
  const calls = [];
  const exec = (cmd, args, opts) => {
    const line = [cmd, ...args].join(' ');
    calls.push({ line, cwd: opts?.cwd });
    if (line.startsWith('git status')) return { code: 0, stdout: porcelain, stderr: '' };
    const hit = Object.entries(codes).find(([needle]) => line.includes(needle));
    return { code: hit ? hit[1] : 0, stdout: hit ? 'dòng lỗi 1\ndòng lỗi 2' : 'ok', stderr: '' };
  };
  return { exec, calls };
}

const ctx = (f, exec, extra = {}) => ({ ...f, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa tab quà.', exec, isolated: true, ...extra });

test('landing chỉ có build-dev + build-pro → chạy build-pro (bản dev sinh sprite sau dist ⇒ dist-stale)', async () => {
  const f = fixture({ scripts: { 'build-dev': 'x', 'build-pro': 'y' } });
  const { exec, calls } = fakeExec();
  await runGates(['build'], ctx(f, exec));
  assert.match(calls[0].line, /npm run build-pro/);
});

test('build ưu tiên build-optimize', async () => {
  const f = fixture();
  const { exec, calls } = fakeExec();
  const r = await runGates(['build'], ctx(f, exec));
  assert.strictEqual(r.pass, true);
  assert.match(calls[0].line, /npm run build-optimize/);
  assert.strictEqual(calls[0].cwd, f.campaignDir);
});

test('không có script build → error', async () => {
  const f = fixture({ scripts: {} });
  const r = await runGates(['build'], ctx(f, fakeExec().exec));
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.error, 'build');
});

test('campaign là file template twig (vportal2view) → build skipped, không chặn', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-gates-'));
  const twig = path.join(repo, 'gn/layout/a.html.twig');
  fs.mkdirSync(path.dirname(twig), { recursive: true });
  fs.writeFileSync(twig, '<div></div>');
  const r = await runGates(['build'], ctx({ repo, campaignDir: twig }, fakeExec().exec));
  assert.deepStrictEqual([r.pass, r.error, r.results[0].status], [true, null, 'skipped']);
});

test('campaign là file twig có pm__ → pm-gate kiểm thẳng file, đủ bộ cổng không vấp', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-gates-'));
  const twig = path.join(repo, 'gn/layout/a.html.twig');
  fs.mkdirSync(path.dirname(twig), { recursive: true });
  fs.writeFileSync(twig, '<div class="pm__login"></div>');
  const { exec, calls } = fakeExec();
  const r = await runGates(['build', 'pm-gate', 'fe-gate', 'landing-parity', 'layout-gate'], ctx({ repo, campaignDir: twig }, exec));
  assert.deepStrictEqual([r.pass, r.error], [true, null]);
  assert.ok(calls.some((c) => c.line.endsWith(`pm-gate.mjs ${twig}`)), calls.map((c) => c.line).join('\n'));
  assert.ok(calls.some((c) => c.line.endsWith(`layout-gate.mjs ${twig}`)));
});

test('exit 1 → fail kèm blocking', async () => {
  const f = fixture();
  const r = await runGates(['pm-gate'], ctx(f, fakeExec({ 'pm-gate': 1 }).exec));
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.error, null);
  assert.deepStrictEqual(r.results[0].blocking, ['dòng lỗi 1', 'dòng lỗi 2']);
});

test('exit 2 → error dừng, không chạy check sau', async () => {
  const f = fixture();
  const { exec, calls } = fakeExec({ 'pm-gate': 2 });
  const r = await runGates(['pm-gate', 'layout-gate'], ctx(f, exec));
  assert.strictEqual(r.error, 'pm-gate');
  assert.ok(!calls.some((c) => c.line.includes('layout-gate')));
});

test('không có pm__ → pm-gate skipped', async () => {
  const f = fixture({ html: '<div class="x"></div>' });
  const r = await runGates(['pm-gate'], ctx(f, fakeExec().exec));
  assert.strictEqual(r.results[0].status, 'skipped');
  assert.strictEqual(r.pass, true);
});

test('commit chỉ lấy giao files verdict với git status', async () => {
  const f = fixture();
  const porcelain = ' M products/x/landing/a/index.html\0 M products/y/other.scss\0';
  const { exec, calls } = fakeExec({}, porcelain);
  const files = ['products/x/landing/a/index.html', 'products/x/landing/a/not-changed.js'];
  await runGates(['commit'], ctx(f, exec, { files }));
  const add = calls.find((c) => c.line.startsWith('git add'));
  assert.strictEqual(add.line, 'git add -- products/x/landing/a/index.html');
});

test('commit message đúng format + trailer, cdn-source chỉ pull khi AUTOPILOT_LAB_WRITES=1', async () => {
  const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-cdn-')), 'cdn-source');
  const campaignDir = path.join(repo, 'products/x/landing/a');
  fs.mkdirSync(campaignDir, { recursive: true });
  const { exec, calls } = fakeExec({}, ' M products/x/landing/a/index.html\0');
  await runGates(['commit'], ctx({ repo, campaignDir }, exec, { files: ['products/x/landing/a/index.html'] }));
  const commit = calls.find((c) => c.line.startsWith('git commit'));
  assert.match(commit.line, /--only products\/x\/landing\/a\/index.html -m \(fix\): sửa tab quà\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>$/);
  assert.ok(!calls.some((c) => c.line.startsWith('git pull')));
  process.env.AUTOPILOT_LAB_WRITES = '1';
  const withWrites = fakeExec({}, ' M products/x/landing/a/index.html\0');
  await runGates(['commit'], ctx({ repo, campaignDir }, withWrites.exec, { files: ['products/x/landing/a/index.html'] }));
  delete process.env.AUTOPILOT_LAB_WRITES;
  assert.ok(withWrites.calls.some((c) => c.line === 'git pull --no-rebase --no-edit origin master'));
});

test('G0: commit thẳng repo thật (không phải worktree) bị tắt khi chưa có AUTOPILOT_LAB_WRITES', async () => {
  const f = fixture();
  const { exec, calls } = fakeExec({}, ' M products/x/landing/a/index.html\0');
  const r = await runGates(['commit'], ctx(f, exec, { isolated: false, files: ['products/x/landing/a/index.html'] }));
  assert.strictEqual(r.results[0].status, 'skipped');
  assert.ok(!calls.some((c) => c.line.startsWith('git commit')));
});

test('commit không có file giao → skipped', async () => {
  const f = fixture();
  const r = await runGates(['commit'], ctx(f, fakeExec().exec, { files: ['a.js'] }));
  assert.strictEqual(r.results[0].status, 'skipped');
});

function gitRepo() {
  const f = fixture();
  const git = (...args) => spawnSync('git', args, { cwd: f.repo, encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  return { ...f, git };
}

test('commit: campaign mới chưa track (landing-new) vẫn commit đúng file trong verdict', async () => {
  const f = gitRepo();
  fs.mkdirSync(path.join(f.campaignDir, 'mới'), { recursive: true });
  fs.writeFileSync(path.join(f.campaignDir, 'mới', 'ảnh.txt'), 'x');
  fs.writeFileSync(path.join(f.repo, 'khac.txt'), 'của phiên khác');
  const files = ['products/x/landing/a/index.html', 'products/x/landing/a/mới/ảnh.txt'];
  const r = await runGates(['commit'], { ...f, key: 'GW-1', flowId: 'landing-new', files, planTitle: 'Dựng landing', isolated: true });
  assert.strictEqual(r.results[0].status, 'pass', r.results[0].note);
  const committed = f.git('-c', 'core.quotepath=off', 'show', '--name-only', '--format=', 'HEAD').stdout.trim().split('\n').sort();
  assert.deepStrictEqual(committed, files.sort());
});

test('chưa có campaignDir → error, không ném', async () => {
  const r = await runGates(['build'], { repo: '/r', campaignDir: null, key: 'GW-1', files: [], exec: fakeExec().exec });
  assert.deepStrictEqual([r.pass, r.error], [false, 'build']);
});

test('commitMessage bỏ tiền tố (type): có sẵn trong tiêu đề plan', async () => {
  const { commitMessage } = await import('./gates.mjs');
  assert.match(commitMessage('landing-fix', '(feat): NTH mã mây (GW-912)'), /^\(fix\): nth mã mây \(gw-912\)\n/);
});

function handoffFixture(html = '<div class="pm__login"></div>') {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-gt-'));
  const campaignDir = path.join(repo, '688-TLBBVNG/event-62839');
  fs.mkdirSync(path.join(campaignDir, 'mainsite'), { recursive: true });
  if (html) fs.writeFileSync(path.join(campaignDir, 'mainsite/index.html'), html);
  return { repo, campaignDir };
}

test('G2: pm-gate-handoff chạy pm-gate --baseline none trên mainsite/*.html', async () => {
  const f = handoffFixture();
  const { exec, calls } = fakeExec();
  const r = await runGates(['pm-gate-handoff', 'check-promotion'], ctx(f, exec));
  assert.strictEqual(r.pass, true);
  assert.match(calls[0].line, /pm-gate\.mjs .*mainsite\/index\.html --baseline none$/);
  assert.match(calls[1].line, /check-promotion\.mjs .*mainsite\/index\.html$/);
});

test('G2: chưa có mainsite/*.html → handoff checks skipped', async () => {
  const r = await runGates(['pm-gate-handoff', 'check-promotion'], ctx(handoffFixture(null), fakeExec().exec));
  assert.deepStrictEqual(r.results.map((x) => x.status), ['skipped', 'skipped']);
});

test('G6: check-promotion trên campaign chưa bàn giao đọc dist/*.html', async () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.campaignDir, 'dist'));
  fs.writeFileSync(path.join(f.campaignDir, 'dist/index.html'), '<div class="pm__login"></div>');
  const { exec, calls } = fakeExec();
  await runGates(['check-promotion'], ctx(f, exec));
  assert.match(calls[0].line, /check-promotion\.mjs .*dist\/index\.html$/);
});
