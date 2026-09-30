import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');
const { attachTerminal, isAllowedOrigin } = require('./terminal.js');

test('chỉ nhận Origin của chính console', () => {
  assert.equal(isAllowedOrigin('http://127.0.0.1:4747', 4747), true);
  assert.equal(isAllowedOrigin('http://localhost:4747', 4747), true);
  assert.equal(isAllowedOrigin('https://trang-la.com', 4747), false);
  assert.equal(isAllowedOrigin('http://127.0.0.1:4748', 4747), false);
  assert.equal(isAllowedOrigin('null', 4747), false);
});

test('không có Origin (script local, không phải trình duyệt) → vẫn nhận', () => {
  assert.equal(isAllowedOrigin(undefined, 4747), true);
});

test('trang lạ mở WebSocket tới /term → bị từ chối 403, không spawn shell', async () => {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const wss = attachTerminal(server, '/term');
  const { port } = server.address();

  try {
    const status = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/term?id=t`, { origin: 'https://trang-la.com' });
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
      ws.on('error', (err) => resolve(err.message));
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'kill' }));
        ws.close();
        resolve('open');
      });
    });
    assert.equal(status, 403);
  } finally {
    wss.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
