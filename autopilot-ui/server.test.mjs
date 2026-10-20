import { test, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

process.env.AUTOPILOT_RUNS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-srv-'));
const { createServer } = await import('./server.mjs');
const { listFlows } = await import('../tools/lib/autopilot/flows.mjs');
const spawned = [];
const server = createServer({ allowWrites: true, spawnCli: (args) => (spawned.push(args), { pid: 1, log: 'x.log' }) });
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

test('POST approve gọi CLI; reject thiếu note → 400', async () => {
  const post = (action, body) => fetch(`${base}/api/autopilot/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.strictEqual((await post('approve', { key: 'GW-1' })).status, 200);
  assert.deepStrictEqual(spawned.at(-1), ['approve', 'GW-1']);
  assert.strictEqual((await post('reject', { key: 'GW-1' })).status, 400);
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
