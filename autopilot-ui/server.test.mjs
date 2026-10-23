import { test, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-srv-'));
const { createServer, spawnDetached } = await import('./server.mjs');
const { listFlows } = await import('../tools/lib/autopilot/flows.mjs');
const { saveRun } = await import('../tools/lib/autopilot/store.mjs');
const { acquire, runLock } = await import('../tools/lib/autopilot/lock.mjs');
const { panelClaude } = await import('./panel-claude.mjs');
const opened = [];
const spawned = [];
const execd = [];
const execCli = async (args) => {
  execd.push(args);
  return args[1] === 'GW-404' ? { code: 1, stdout: '', stderr: 'Chưa có run nào cho GW-404\n' } : { code: 0, stdout: '{"key":"GW-1","cwd":"/wt","args":["x"],"env":{}}\n', stderr: '' };
};
const server = createServer({ allowWrites: true, execCli, openEditor: async (dir) => { opened.push(dir); }, spawnCli: async (args) => (spawned.push(args), args[1] === 'GW-REFUSED' ? { pid: 1, log: 'x.log', code: 1, error: 'GW-REFUSED đang stopped, không có gì để approve.' } : { pid: 1, log: 'x.log' }) });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

test('GET / trả trang console mới', async () => {
  const res = await fetch(`${base}/`);
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /<title>Console<\/title>/);
});

test('mount router của console cũ: /api/state trả JSON', async () => {
  const res = await fetch(`${base}/api/state`);
  assert.strictEqual(res.status, 200);
  assert.ok(typeof (await res.json()) === 'object');
});

test('serve module trang và xterm', async () => {
  assert.strictEqual((await fetch(`${base}/app.js`)).status, 200);
  assert.strictEqual((await fetch(`${base}/vendor/xterm/xterm.js`)).status, 200);
  assert.strictEqual((await fetch(`${base}/vendor/xterm/xterm.css`)).status, 200);
  assert.strictEqual((await fetch(`${base}/vendor/xterm-fit/addon-fit.js`)).status, 200);
});

test('GET /api/autopilot/runs trả JSON danh sách', async () => {
  const data = await (await fetch(`${base}/api/autopilot/runs`)).json();
  assert.deepStrictEqual(data.runs, []);
  assert.strictEqual(data.flows.length, listFlows().length);
});

test('POST approve/pause gọi CLI; reject thiếu note → 400', async () => {
  const post = (action, body) => fetch(`${base}/api/autopilot/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.strictEqual((await post('approve', { key: 'GW-1' })).status, 200);
  assert.deepStrictEqual(spawned.at(-1), ['approve', 'GW-1']);
  assert.strictEqual((await post('reject', { key: 'GW-1' })).status, 400);
  assert.strictEqual((await post('pause', { key: 'GW-1' })).status, 200);
  assert.deepStrictEqual(spawned.at(-1), ['pause', 'GW-1']);
});

test('Host lạ (DNS rebinding) → 403', async () => {
  const status = await new Promise((resolve) =>
    http.get(`${base}/api/autopilot/runs`, { headers: { Host: 'evil.com' } }, (res) => resolve(res.statusCode)));
  assert.strictEqual(status, 403);
});

test('live log chưa có → 204', async () => {
  assert.strictEqual((await fetch(`${base}/api/autopilot/runs/GW-1/r1/live`)).status, 204);
});

test('artifact không có → 404', async () => {
  assert.strictEqual((await fetch(`${base}/api/autopilot/runs/GW-1/r1/artifacts/x.md`)).status, 404);
});

test('bản thử: nút autopilot chạy được (run nằm trong worktree + sandbox), lệnh ghi của console vẫn chặn', async (t) => {
  const lab = createServer({ allowWrites: false, spawnCli: (args) => (spawned.push(args), { pid: 1, log: 'x.log' }) });
  await new Promise((r) => lab.listen(0, '127.0.0.1', r));
  t.after(() => lab.close());
  const url = `http://127.0.0.1:${lab.address().port}`;
  const before = spawned.length;
  const post = (p) => fetch(`${url}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"key":"GW-1"}' });
  assert.notStrictEqual((await post('/api/autopilot/approve')).status, 403);
  assert.strictEqual((await post('/api/board/check')).status, 403);
  assert.strictEqual((await fetch(`${url}/api/state`)).status, 200);
  assert.strictEqual(spawned.length, before + 1);
});

test('POST open chạy CLI đồng bộ, trả JSON kèm lệnh gõ vào tab (claude có đoạn dặn panel); CLI lỗi → 400 kèm lý do', async () => {
  const post = (body) => fetch(`${base}/api/autopilot/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ok = await post({ input: 'GW-1', flow: 'feature' });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(await ok.json(), { key: 'GW-1', cwd: '/wt', args: ['x'], env: {}, command: `cd '/wt' && ${panelClaude(['x'])}` });
  assert.deepStrictEqual(execd.at(-1), ['open', 'GW-1', '--flow', 'feature']);
  const bad = await post({ key: 'GW-404', attach: true });
  assert.strictEqual(bad.status, 400);
  assert.match((await bad.json()).error, /GW-404/);
  const before = spawned.length;
  assert.strictEqual((await fetch(`${base}/api/autopilot/reviewed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"key":"GW-1"}' })).status, 200);
  assert.deepStrictEqual([spawned.length - before, spawned.at(-1)], [1, ['reviewed', 'GW-1']]);
});

test('GET changes đọc git của run; POST code chỉ mở worktree của chính run đó', async () => {
  const done = { key: 'GW-50', runId: '20261020-100000', flow: 'landing-fix', status: 'done', stage: null, receipts: [], worktrees: { '/khong-co-repo': '/khong-co-repo-wt' } };
  saveRun(done);
  const changes = await (await fetch(`${base}/api/autopilot/runs/GW-50/20261020-100000/changes`)).json();
  assert.deepStrictEqual(changes.map((c) => [c.name, c.worktree, c.commits.length]), [['khong-co-repo', '/khong-co-repo-wt', 0]]);
  assert.strictEqual((await fetch(`${base}/api/autopilot/runs/GW-50/khong-co/changes`)).status, 404);

  const post = (body) => fetch(`${base}/api/autopilot/code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.strictEqual((await post({ key: 'GW-50', runId: '20261020-100000', dir: '/khong-co-repo-wt' })).status, 200);
  assert.deepStrictEqual(opened, ['/khong-co-repo-wt']);
  assert.strictEqual((await post({ key: 'GW-50', runId: '20261020-100000', dir: '/etc' })).status, 400);
  assert.deepStrictEqual(opened, ['/khong-co-repo-wt']);
});

test('retry/skip/goto/pick/break: soát trước khi spawn; GET /runs có actions; preview gọi route --json', async () => {
  const post = (action, body) => fetch(`${base}/api/autopilot/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const make = (key, patch) => saveRun({
    key, runId: '20261020-120000', flow: 'landing-fix', status: 'running', stage: 'plan', stopReason: null, routerReason: 'x', campaignDir: '/c',
    blockedBy: [], loops: {}, sessions: {}, budget: { usd: 25, minutes: 120 }, receipts: [], ...patch,
  });
  make('GW-11', {});
  acquire(runLock({ key: 'GW-11', runId: '20261020-120000' }), { key: 'GW-11', runId: '20261020-120000' });
  const before = spawned.length;
  const refused = await post('skip', { key: 'GW-11' });
  assert.strictEqual(refused.status, 400);
  assert.match((await refused.json()).error, /đang chạy/);
  assert.strictEqual(spawned.length, before);

  const passed = { stage: 'plan', round: 1, verdict: 'pass', blocking: 0, advisory: 0, turns: 1, costUsd: 0, ms: 1 };
  make('GW-12', { status: 'stopped', stage: 'gates', stopReason: 'x', receipts: [passed] });
  const ok = await post('goto', { key: 'GW-12', stage: 'plan', note: 'làm lại' });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(spawned.at(-1), ['goto', 'GW-12', 'plan', '--note', 'làm lại']);
  assert.strictEqual((await post('goto', { key: 'GW-12', stage: 'fix', note: 'x' })).status, 400);

  const view = await (await fetch(`${base}/api/autopilot/runs`)).json();
  const types = view.runs.find((r) => r.key === 'GW-12').actions.map((a) => a.type);
  assert.ok(['retry', 'skip', 'goto'].every((t) => types.includes(t)));

  const preview = await (await fetch(`${base}/api/autopilot/preview?input=GW-1&flow=feature`)).json();
  assert.ok(preview.key);
  assert.deepStrictEqual(execd.at(-1), ['route', 'GW-1', '--json', '--flow', 'feature']);
  assert.strictEqual((await fetch(`${base}/api/autopilot/preview?input=--x`)).status, 400);
  assert.strictEqual((await fetch(`${base}/api/autopilot/preview?input=GW-404`)).status, 400);
});

test('CLI tách nền bị từ chối ngay (thoát ≠0 trong vài giây) → 400 kèm lý do', async () => {
  const res = await fetch(`${base}/api/autopilot/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'GW-REFUSED' }) });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /đang stopped/);
});

test('spawnDetached: CLI thoát lỗi sớm → trả code + đuôi log; còn chạy quá hạn chờ → chỉ pid + log', async () => {
  const failed = await spawnDetached(['approve', 'GW-404']);
  assert.strictEqual(failed.code, 1);
  assert.match(failed.error, /Chưa có run nào cho GW-404/);
  const slow = await spawnDetached(['setTimeout(() => {}, 400)'], { waitMs: 50, cli: '-e' });
  assert.deepStrictEqual([slow.code, typeof slow.pid], [undefined, 'number']);
});

test('lỗi trong handler autopilot → 500, server không sập (terminal sống theo process)', async () => {
  const dir = path.join(process.env.AUTOPILOT_RUNS_DIR, 'GW-77', '20261023-000000');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'run.json'), '{hỏng');
  try {
    const res = await fetch(`${base}/api/autopilot/runs`);
    assert.strictEqual(res.status, 500);
    assert.ok((await res.json()).error);
    assert.strictEqual((await fetch(`${base}/api/state`)).status, 200);
  } finally {
    fs.rmSync(path.join(process.env.AUTOPILOT_RUNS_DIR, 'GW-77'), { recursive: true });
  }
});

test('GET /api/autopilot/events mở luồng SSE, gửi ngay danh sách run', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/autopilot/events`, { signal: ctrl.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  let text = '';
  while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
  ctrl.abort();
  assert.match(text, /event: runs/);
});
