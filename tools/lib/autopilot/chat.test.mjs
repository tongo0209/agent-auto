import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-chat-'));
process.env.AUTOPILOT_CLAUDE_PROJECTS = root;
process.env.AUTOPILOT_RUNS_DIR = path.join(root, 'runs');
const { latestSession, sessionUsage, chatCwd, attachBriefOf, chatLaunch, briefOf } = await import('./chat.mjs');
const { loadFlow } = await import('./flows.mjs');
const LAB = path.resolve(import.meta.dirname, '../../..');

const line = (o) => JSON.stringify(o);

test('latestSession: thư mục phiên theo cwd (ký tự ngoài chữ-số thành -), lấy file sửa gần nhất', () => {
  const cwd = '/Users/x/VNG/agent-auto-lab/runs/GW-1/r1/wt/cdn-source';
  assert.strictEqual(latestSession(cwd), null);
  const dir = path.join(root, '-Users-x-VNG-agent-auto-lab-runs-GW-1-r1-wt-cdn-source');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.jsonl'), '');
  fs.utimesSync(path.join(dir, 'a.jsonl'), new Date(2020, 1, 1), new Date(2020, 1, 1));
  fs.writeFileSync(path.join(dir, 'b.jsonl'), '');
  fs.writeFileSync(path.join(dir, 'c.txt'), '');
  assert.deepStrictEqual(latestSession(cwd), { id: 'b', file: path.join(dir, 'b.jsonl') });
});

test('sessionUsage: cộng usage mỗi message 1 lần (stream ghi lặp cùng id), phút = đầu tới cuối phiên', () => {
  const file = path.join(root, 's.jsonl');
  const usage = { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 30, cache_creation_input_tokens: 400 };
  fs.writeFileSync(file, [
    line({ type: 'user', timestamp: '2026-10-20T10:00:00Z', message: { role: 'user', content: 'x' } }),
    line({ type: 'assistant', timestamp: '2026-10-20T10:01:00Z', message: { id: 'm1', usage } }),
    line({ type: 'assistant', timestamp: '2026-10-20T10:01:01Z', message: { id: 'm1', usage } }),
    line({ type: 'assistant', timestamp: '2026-10-20T10:05:00Z', message: { id: 'm2', usage: { output_tokens: 7 } } }),
    '{"type":"assis',
  ].join('\n'));
  assert.deepStrictEqual(sessionUsage(file), { tokens: 440, ms: 5 * 60_000 });
});

test('R19 chatCwd: run mới mở thẳng ở repo gốc; run chưa có repo → agent-auto-lab; run cũ có worktree → worktree', () => {
  assert.strictEqual(chatCwd({ repo: '/x/repo', worktrees: {} }), '/x/repo');
  assert.strictEqual(chatCwd({ repo: null, worktrees: {} }), LAB);
  assert.strictEqual(chatCwd({ repo: '/x/repo', worktrees: { '/x/repo': '/w/repo' } }), '/w/repo');
});

test('R19 chatLaunch: sandbox mở ghi đúng repo của run; brief nói làm thẳng trên nhánh, cấm checkout/reset/stash/clean', () => {
  const run = { key: 'GW-51', runId: 'r1', flow: 'landing-fix', status: 'chat', stage: 'plan', receipts: [], worktrees: {}, repo: '/x/repo', workBranch: { '/x/repo': 'tont' } };
  assert.ok(!chatLaunch(run).args.includes('--settings'));
  process.env.AUTOPILOT_SANDBOX = '1';
  const launch = chatLaunch(run);
  delete process.env.AUTOPILOT_SANDBOX;
  assert.strictEqual(launch.cwd, '/x/repo');
  assert.ok(launch.args.some((a) => a.includes('sandbox-hook.mjs\\" \\"/x/repo')), launch.args.join(' '));
  const brief = briefOf(run, loadFlow('landing-fix'));
  assert.match(brief, /repo gốc `\/x\/repo`, nhánh `tont`/);
  assert.match(brief, /không checkout\/reset\/stash\/clean/);
  assert.doesNotMatch(brief, /worktree|chặn ghi/i);
});

test('attachBriefOf run tự động đang chạy: dặn pause trước khi sửa file, chỉ có lệnh pause', () => {
  const run = { key: 'GW-50', runId: 'r1', flow: 'landing-fix', status: 'running', stage: 'implement', stopReason: null, receipts: [{ stage: 'plan', round: 1, verdict: 'pass' }], worktrees: {}, repo: null };
  fs.mkdirSync(path.join(root, 'runs', 'GW-50', 'r1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', 'GW-50', 'r1', 'plan.md'), '# p');
  const brief = attachBriefOf(run, loadFlow('landing-fix'), []);
  assert.match(brief, /implement/);
  assert.match(brief, /plan · vòng 1 · pass/);
  assert.match(brief, /plan\.md/);
  assert.match(brief, /phải `pause` trước khi sửa file/);
  assert.ok(brief.includes('pause GW-50'));
  assert.ok(!brief.includes('reviewed GW-50'));
});
