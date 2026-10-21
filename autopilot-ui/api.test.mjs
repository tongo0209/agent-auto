import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-api-'));
process.env.AUTOPILOT_CLAUDE_PROJECTS = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-proj-'));
const { listView, artifactFile, listArtifacts, actionArgs, checkAction, liveLog, worktreeOf } = await import('./api.mjs');
const { saveRun, writeArtifact } = await import('../tools/lib/autopilot/store.mjs');
const { acquire, runLock } = await import('../tools/lib/autopilot/lock.mjs');

const run = {
  key: 'GW-1', runId: '20261020-100000', flow: 'landing-fix', status: 'paused', stage: 'approve-plan', stopReason: null,
  routerReason: 'x', campaignDir: '/c', blockedBy: [], loops: {}, sessions: {}, budget: { usd: 25, minutes: 120 },
  receipts: [{ stage: 'plan', round: 1, verdict: 'pass', blocking: 0, advisory: 0, turns: 10, costUsd: 1.5, ms: 60000 }],
};
saveRun(run);
writeArtifact(run, 'plan.md', '# Sửa tab');
saveRun({ ...run, key: 'GW-2', status: 'done', stage: null });

test('listView: receipt cũ chưa ghi token → đọc bù từ dòng result trong log của stage', async () => {
  const old = { ...run, key: 'GW-3', runId: '20261019-100000', status: 'done', stage: null };
  saveRun(old);
  writeArtifact(old, 'plan-r1.log', '{"type":"assistant"}\n{"duration_ms":5,"usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":30,"cache_creation_input_tokens":400},"type":"result"}\n');
  const view = await listView();
  assert.strictEqual(view.runs.find((r) => r.key === 'GW-3').totals.tokens, 433);
});

test('listView: chờ bạn xếp trước, có cells + totals + show của stage hiện tại', async () => {
  const view = await listView();
  assert.deepStrictEqual(view.runs.map((r) => r.key).slice(0, 2), ['GW-1', 'GW-2']);
  const first = view.runs[0];
  assert.strictEqual(first.cells.find((c) => c.id === 'approve-plan').state, 'waiting');
  assert.deepStrictEqual(first.cells.find((c) => c.id === 'gates'), { ...first.cells.find((c) => c.id === 'gates'), back: 'fix', side: false });
  assert.strictEqual(first.cells.find((c) => c.id === 'fix').side, true);
  assert.deepStrictEqual(first.totals, { runs: 1, turns: 10, minutes: 1, usd: 1.5, tokens: 0 });
  assert.deepStrictEqual(first.show, ['plan.md', 'plan-review-r*.json']);
  assert.ok(first.flowLabel.length > 0);
});

test('artifact: chỉ đọc file trong thư mục run, chặn path traversal', () => {
  assert.ok(artifactFile('GW-1', '20261020-100000', 'plan.md').endsWith('plan.md'));
  assert.strictEqual(artifactFile('GW-1', '20261020-100000', '../../.lock-run'), null);
  assert.strictEqual(artifactFile('../x', '20261020-100000', 'plan.md'), null);
  assert.strictEqual(artifactFile('GW-1', '20261020-100000', 'khong-co.md'), null);
  assert.deepStrictEqual(listArtifacts('GW-1', '20261020-100000'), ['plan.md']);
});

test('actionArgs: dựng đúng lệnh CLI, chặn đầu vào xấu', () => {
  assert.deepStrictEqual(actionArgs('approve', { key: 'GW-1' }), ['approve', 'GW-1']);
  assert.deepStrictEqual(actionArgs('pause', { key: 'GW-1' }), ['pause', 'GW-1']);
  assert.deepStrictEqual(actionArgs('reject', { key: 'GW-1', note: 'thêm tab' }), ['reject', 'GW-1', '--note', 'thêm tab']);
  assert.deepStrictEqual(actionArgs('run', { input: 'GW-9', flow: 'feature' }), ['run', 'GW-9', '--flow', 'feature']);
  assert.throws(() => actionArgs('reject', { key: 'GW-1' }), /note/);
  assert.throws(() => actionArgs('rm', { key: 'GW-1' }), /action/);
  assert.throws(() => actionArgs('approve', { key: 'GW-1; rm -rf /' }), /key/);
  assert.throws(() => actionArgs('run', { input: 'GW-9', flow: '../x' }), /flow/);
  assert.deepStrictEqual(actionArgs('open', { input: 'GW-9', flow: 'feature' }), ['open', 'GW-9', '--flow', 'feature']);
  assert.deepStrictEqual(actionArgs('open', { key: 'GW-9', attach: true }), ['open', 'GW-9', '--attach']);
  assert.deepStrictEqual(actionArgs('reviewed', { key: 'GW-9' }), ['reviewed', 'GW-9']);
  assert.throws(() => actionArgs('done', { key: 'GW-9' }), /action lạ/);
  assert.throws(() => actionArgs('open', { input: '--resume' }), /input/);
  assert.throws(() => actionArgs('open', { key: '../x', attach: true }), /key/);
});

test('liveLog: đọc .log mới nhất của run, đổi stream-json thành dòng dễ đọc', () => {
  const events = [
    { type: 'system', subtype: 'init', model: 'opus' },
    { type: 'system', subtype: 'hook_response' },
    { type: 'rate_limit_event' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Đọc plan' }, { type: 'tool_use', name: 'Read', input: { file_path: '/a/b.scss' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'x'.repeat(500) }] } },
  ];
  writeArtifact(run, 'implement-r1.log', `${events.map((e) => JSON.stringify(e)).join('\n')}\n{"type":"assis`);
  const live = liveLog('GW-1', '20261020-100000');
  assert.strictEqual(live.file, 'implement-r1.log');
  assert.deepStrictEqual(live.lines.map((l) => l.kind), ['init', 'text', 'tool', 'result']);
  assert.strictEqual(live.lines[2].text, 'Read /a/b.scss');
  assert.ok(live.lines[3].text.length <= 200);
  writeArtifact(run, 'plan-r1.log', '{"type":"result","num_turns":3,"total_cost_usd":0.4}\n');
  assert.deepStrictEqual(liveLog('GW-1', '20261020-100000', 'plan-r1.log').lines, [{ kind: 'done', text: 'xong · 3 lượt · $0.40' }]);
  assert.strictEqual(liveLog('GW-1', '20261020-100000', 'plan.md'), null);
  assert.strictEqual(liveLog('../x', '1'), null);
  assert.strictEqual(liveLog('GW-2', '20261020-100000'), null);
});

test('listView: run running mà không process giữ lock → interrupted; run chờ duyệt thì không', async () => {
  saveRun({ ...run, key: 'GW-4', status: 'running', stage: 'implement' });
  const view = await listView();
  assert.strictEqual(view.runs.find((r) => r.key === 'GW-4').interrupted, true);
  assert.strictEqual(view.runs.find((r) => r.key === 'GW-1').interrupted, false);
});

test('listArtifacts: ẩn file đánh dấu .pause', () => {
  writeArtifact({ ...run, key: 'GW-5' }, '.pause', '');
  writeArtifact({ ...run, key: 'GW-5' }, 'plan.md', '# x');
  assert.deepStrictEqual(listArtifacts('GW-5', run.runId), ['plan.md']);
});

test('listView: run chat lấy token + phút từ phiên claude mới nhất của worktree, xếp sau run chờ duyệt', async () => {
  const wt = '/wt/GW-6/cdn-source';
  saveRun({ ...run, key: 'GW-6', mode: 'chat', status: 'chat', stage: 'plan', chatState: 'ask', repo: '/repo/cdn-source', worktrees: { '/repo/cdn-source': wt }, receipts: [] });
  const dir = path.join(process.env.AUTOPILOT_CLAUDE_PROJECTS, wt.replace(/[^A-Za-z0-9]/g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 's1.jsonl'), [
    JSON.stringify({ timestamp: '2026-10-20T10:00:00Z', message: { id: 'm1', usage: { input_tokens: 100, output_tokens: 20 } } }),
    JSON.stringify({ timestamp: '2026-10-20T10:03:00Z', message: { id: 'm2', usage: { output_tokens: 5 } } }),
  ].join('\n'));
  const view = await listView();
  const chat = view.runs.find((r) => r.key === 'GW-6');
  assert.deepStrictEqual([chat.totals.tokens, chat.totals.minutes], [125, 3]);
  assert.strictEqual(chat.cells.find((c) => c.id === 'plan').state, 'waiting');
  assert.ok(view.runs.findIndex((r) => r.key === 'GW-6') < view.runs.findIndex((r) => r.key === 'GW-2'));
});

test('listArtifacts: bỏ thư mục con (wt/ của worktree) — chỉ liệt kê file', () => {
  writeArtifact({ ...run, key: 'GW-7' }, 'brief.md', '# x');
  fs.mkdirSync(path.join(process.env.AUTOPILOT_RUNS_DIR, 'GW-7', run.runId, 'wt', 'repo'), { recursive: true });
  assert.deepStrictEqual(listArtifacts('GW-7', run.runId), ['brief.md']);
});

test('listView: run done có worktree mà chưa review → awaitingReview; đã review hoặc không có worktree thì không', async () => {
  saveRun({ ...run, key: 'GW-40', status: 'done', stage: null, worktrees: { '/r': '/r-wt' } });
  saveRun({ ...run, key: 'GW-41', status: 'done', stage: null, worktrees: { '/r': '/r-wt' }, reviewedAt: 1 });
  const view = await listView();
  const flag = (key) => view.runs.find((r) => r.key === key).awaitingReview;
  assert.deepStrictEqual([flag('GW-40'), flag('GW-41'), flag('GW-2'), flag('GW-1')], [true, false, false, false]);
});

test('R19 listView: run làm thẳng repo gốc có commit mà chưa review → awaitingReview; chưa commit gì thì không', async () => {
  saveRun({ ...run, key: 'GW-42', status: 'done', stage: null, worktrees: {}, workBranch: { '/r': 'tont' }, commits: [{ repo: '/r', sha: 'abc' }] });
  saveRun({ ...run, key: 'GW-43', status: 'done', stage: null, worktrees: {}, workBranch: { '/r': 'tont' }, commits: [] });
  const view = await listView();
  const flag = (key) => view.runs.find((r) => r.key === key).awaitingReview;
  assert.deepStrictEqual([flag('GW-42'), flag('GW-43')], [true, false]);
});

test('R19 worktreeOf: mở được repo gốc của run mới, từ chối thư mục khác', () => {
  saveRun({ ...run, key: 'GW-44', worktrees: {}, workBranch: { '/r': 'tont' } });
  assert.strictEqual(worktreeOf({ key: 'GW-44', runId: run.runId, dir: '/r' }), '/r');
  assert.throws(() => worktreeOf({ key: 'GW-44', runId: run.runId, dir: '/etc' }), /không phải/);
});

test('actionArgs: goto/skip/pick/break và run có kế hoạch', () => {
  assert.deepStrictEqual(actionArgs('goto', { key: 'GW-1', stage: 'plan', note: 'x' }), ['goto', 'GW-1', 'plan', '--note', 'x']);
  assert.throws(() => actionArgs('goto', { key: 'GW-1', stage: '../x', note: 'x' }), /stage/);
  assert.throws(() => actionArgs('goto', { key: 'GW-1', stage: 'plan', note: '  ' }), /goto cần note/);
  assert.deepStrictEqual(actionArgs('pick', { key: 'GW-1', option: 'B', note: 'n' }), ['pick', 'GW-1', 'B', '--note', 'n']);
  assert.throws(() => actionArgs('pick', { key: 'GW-1', option: 'D' }), /option/);
  assert.deepStrictEqual(actionArgs('retry', { key: 'GW-1' }), ['retry', 'GW-1']);
  assert.deepStrictEqual(actionArgs('skip', { key: 'GW-1', reason: 'bỏ' }), ['skip', 'GW-1', '--reason', 'bỏ']);
  assert.deepStrictEqual(actionArgs('break', { key: 'GW-1', stage: 'fix', off: true }), ['break', 'GW-1', 'fix', '--off']);
  assert.deepStrictEqual(actionArgs('break', { key: 'GW-1', stage: 'fix' }), ['break', 'GW-1', 'fix']);
  assert.deepStrictEqual(
    actionArgs('run', { input: 'GW-9', flow: 'feature', skip: ['a', 'b'], skipReason: 'vì', breaks: ['c', 'd'] }),
    ['run', 'GW-9', '--flow', 'feature', '--skip', 'a,b', '--skip-reason', 'vì', '--break', 'c,d']);
  assert.throws(() => actionArgs('run', { input: 'GW-9', skip: ['../a'] }), /stage/);
  assert.throws(() => actionArgs('run', { input: 'GW-9', breaks: ['A'] }), /stage/);
});

test('checkAction: run đang chạy không skip được; run đã xong qua plan cho goto', () => {
  saveRun({ ...run, key: 'GW-5', status: 'running', stage: 'plan', receipts: [] });
  acquire(runLock({ key: 'GW-5', runId: run.runId }), { key: 'GW-5', runId: run.runId });
  assert.throws(() => checkAction('skip', { key: 'GW-5' }), /đang chạy/);
  assert.doesNotThrow(() => checkAction('break', { key: 'GW-5', stage: 'fix' }));
  assert.doesNotThrow(() => checkAction('approve', { key: 'GW-5' }));
  assert.throws(() => checkAction('retry', { key: 'GW-404' }), /run/);
  assert.throws(() => checkAction('run', { input: 'GW-9', flow: 'landing-fix', skip: ['nope'] }), /stage nope/);
  assert.doesNotThrow(() => checkAction('run', { input: 'GW-9' }));
});

test('checkAction: run bị ngắt nhận retry/goto; listView có retry cho run bị ngắt', async () => {
  saveRun({ ...run, key: 'GW-11', status: 'running', stage: 'plan-review' });
  assert.doesNotThrow(() => checkAction('retry', { key: 'GW-11' }));
  assert.doesNotThrow(() => checkAction('goto', { key: 'GW-11', stage: 'plan', note: 'x' }));
  const view = (await listView()).runs.find((r) => r.key === 'GW-11');
  assert.ok(view.actions.some((a) => a.type === 'retry'));
});

test('checkAction break --off ở stage không có điểm dừng → no-op, không lỗi', () => {
  assert.doesNotThrow(() => checkAction('break', { key: 'GW-1', stage: 'plan', off: true }));
  assert.throws(() => checkAction('break', { key: 'GW-1', stage: 'plan' }), /đã chạy xong/);
});

test('listView: run có actions, options chỉ ở approve-plan, mặc định plan/gateSkipped/choice', async () => {
  const view = await listView();
  const first = view.runs.find((r) => r.key === 'GW-1');
  assert.ok(Array.isArray(first.actions));
  assert.deepStrictEqual(first.options, []);
  assert.deepStrictEqual(first.plan, { disabled: [], breakpoints: [] });
  assert.deepStrictEqual(first.gateSkipped, []);
  assert.strictEqual(first.choice, null);
  writeArtifact({ ...run, key: 'GW-6', runId: '20261020-110000' }, 'plan.md', '# P\n\n## Phương án\n\n### A · Một\nx\n\n### B · Hai\ny\n');
  saveRun({ ...run, key: 'GW-6', runId: '20261020-110000' });
  const withOptions = (await listView()).runs.find((r) => r.key === 'GW-6');
  assert.deepStrictEqual(withOptions.options.map((o) => o.id), ['A', 'B']);
  assert.ok(withOptions.actions.some((a) => a.type === 'pick'));
});

test('checkAction skip qua API: không lỗi "Invalid time value"', () => {
  saveRun({ ...run, key: 'GW-12', status: 'stopped', stage: 'plan-review', stopReason: 'fail:plan-review' });
  assert.doesNotThrow(() => checkAction('skip', { key: 'GW-12' }));
});
