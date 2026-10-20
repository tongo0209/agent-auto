import { test, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-srv-'));
const { createServer } = await import('./server.mjs');
const { listFlows } = await import('../tools/lib/autopilot/flows.mjs');
const { saveRun } = await import('../tools/lib/autopilot/store.mjs');
const opened = [];
const spawned = [];
const execd = [];
const execCli = async (args) => {
  execd.push(args);
  return args[1] === 'GW-404' ? { code: 1, stdout: '', stderr: 'Chưa có run nào cho GW-404\n' } : { code: 0, stdout: '{"key":"GW-1","cwd":"/wt","args":["x"],"env":{}}\n', stderr: '' };
};
const server = createServer({ allowWrites: true, execCli, openEditor: async (dir) => { opened.push(dir); }, spawnCli: (args) => (spawned.push(args), { pid: 1, log: 'x.log' }) });
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

test('bản thử: nút autopilot chạy được (run nằm trong worktree + sandbox), lệnh ghi của console vẫn chặn', async () => {
  const lab = createServer({ spawnCli: (args) => (spawned.push(args), { pid: 1, log: 'x.log' }) });
  await new Promise((r) => lab.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${lab.address().port}`;
  const before = spawned.length;
  const post = (p) => fetch(`${url}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"key":"GW-1"}' });
  assert.notStrictEqual((await post('/api/autopilot/approve')).status, 403);
  assert.strictEqual((await post('/api/board/check')).status, 403);
  assert.strictEqual((await fetch(`${url}/api/state`)).status, 200);
  assert.strictEqual(spawned.length, before + 1);
  lab.close();
});

test('POST open chạy CLI đồng bộ, trả nguyên JSON để UI mở tab; CLI lỗi → 400 kèm lý do', async () => {
  const post = (body) => fetch(`${base}/api/autopilot/open`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ok = await post({ input: 'GW-1', flow: 'feature' });
  assert.strictEqual(ok.status, 200);
  assert.deepStrictEqual(await ok.json(), { key: 'GW-1', cwd: '/wt', args: ['x'], env: {} });
  assert.deepStrictEqual(execd.at(-1), ['open', 'GW-1', '--flow', 'feature']);
  const bad = await post({ key: 'GW-404', resume: true });
  assert.strictEqual(bad.status, 400);
  assert.match((await bad.json()).error, /GW-404/);
  const before = spawned.length;
  assert.strictEqual((await fetch(`${base}/api/autopilot/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"key":"GW-1"}' })).status, 200);
  assert.deepStrictEqual([spawned.length - before, spawned.at(-1)], [1, ['done', 'GW-1']]);
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
