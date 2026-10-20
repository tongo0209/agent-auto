import { test } from 'node:test';
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

const ctx = (f, exec, extra = {}) => ({ ...f, key: 'GW-1', flowId: 'landing-fix', files: [], planTitle: 'Sửa tab quà.', exec, ...extra });

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
  const porcelain = ' M products/x/landing/a/index.html\n M products/y/other.scss\n';
  const { exec, calls } = fakeExec({}, porcelain);
  const files = ['products/x/landing/a/index.html', 'products/x/landing/a/not-changed.js'];
  await runGates(['commit'], ctx(f, exec, { files }));
  const add = calls.find((c) => c.line.startsWith('git add'));
  assert.strictEqual(add.line, 'git add -- products/x/landing/a/index.html');
});

test('commit message đúng format + trailer, cdn-source có pull', async () => {
  const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-cdn-')), 'cdn-source');
  const campaignDir = path.join(repo, 'products/x/landing/a');
  fs.mkdirSync(campaignDir, { recursive: true });
  const { exec, calls } = fakeExec({}, ' M products/x/landing/a/index.html\n');
  await runGates(['commit'], ctx({ repo, campaignDir }, exec, { files: ['products/x/landing/a/index.html'] }));
  const commit = calls.find((c) => c.line.startsWith('git commit'));
  assert.match(commit.line, /--only products\/x\/landing\/a\/index.html -m \(fix\): sửa tab quà\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>$/);
  assert.ok(calls.some((c) => c.line === 'git pull --no-rebase --no-edit origin master'));
});

test('commit không có file giao → skipped', async () => {
  const f = fixture();
  const r = await runGates(['commit'], ctx(f, fakeExec().exec, { files: ['a.js'] }));
  assert.strictEqual(r.results[0].status, 'skipped');
});
