import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { listenWithFallback } = require('./listen.js');

const HOST = '127.0.0.1';

/** Server chỉ để chiếm cổng trong test */
function occupy(port) {
  return new Promise((resolve, reject) => {
    const s = http.createServer(() => {});
    s.once('error', reject);
    s.listen(port, HOST, () => resolve(s));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('cổng trống → listen đúng cổng ưu tiên', async () => {
  const blocker = await occupy(0);
  const free = blocker.address().port;
  await close(blocker); // cổng vừa nhả ra, chắc chắn trống

  const server = http.createServer(() => {});
  const port = await listenWithFallback(server, { port: free, host: HOST });
  assert.equal(port, free);
  assert.equal(server.address().port, free);
  await close(server);
});

test('cổng bị chiếm → nhảy sang cổng kế tiếp', async () => {
  const blocker = await occupy(0);
  const taken = blocker.address().port;

  const server = http.createServer(() => {});
  const port = await listenWithFallback(server, { port: taken, host: HOST, tries: 5 });
  assert.notEqual(port, taken, 'không được trả về cổng đang bị chiếm');
  assert.ok(port > taken && port <= taken + 5, `cổng ${port} phải nằm trong dải thử`);
  assert.equal(server.address().port, port);

  await close(server);
  await close(blocker);
});

test('bị chiếm liên tiếp hết lượt thử → reject EADDRINUSE', async () => {
  const b1 = await occupy(0);
  const p1 = b1.address().port;
  const b2 = await occupy(p1 + 1);

  const server = http.createServer(() => {});
  await assert.rejects(
    () => listenWithFallback(server, { port: p1, host: HOST, tries: 1 }),
    (err) => err.code === 'EADDRINUSE'
  );

  await close(b1);
  await close(b2);
});

test('báo mỗi lần nhảy cổng qua onBusy', async () => {
  const blocker = await occupy(0);
  const taken = blocker.address().port;
  const busy = [];

  const server = http.createServer(() => {});
  await listenWithFallback(server, { port: taken, host: HOST, tries: 3, onBusy: (p) => busy.push(p) });
  assert.deepEqual(busy, [taken]);

  await close(server);
  await close(blocker);
});
