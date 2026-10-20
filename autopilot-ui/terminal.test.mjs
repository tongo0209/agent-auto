import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { attachTerminal, shellEnv } from './terminal.mjs';
import { consoleRequire } from './console-root.mjs';

const WebSocket = consoleRequire('ws');

const open = (url) =>
  new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.output = '';
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === 'output') ws.output += msg.data;
      if (msg.type === 'attached') resolve(ws);
    });
  });

test('reload: socket cũ đóng SAU khi socket mới gắn vẫn không cắt output của socket mới', async () => {
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  attachTerminal(server, '/term');
  const url = `ws://127.0.0.1:${server.address().port}/term?id=race-1`;
  const oldWs = await open(url);
  const newWs = await open(url);
  oldWs.close();
  await new Promise((r) => oldWs.on('close', r));
  newWs.send(JSON.stringify({ type: 'input', data: 'echo race-$((40+2))\r' }));
  const deadline = Date.now() + 15000;
  while (!newWs.output.includes('race-42') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  newWs.send(JSON.stringify({ type: 'kill' }));
  newWs.close();
  server.close();
  assert.ok(newWs.output.includes('race-42'), 'socket mới phải nhận output sau khi socket cũ đóng');
});

test('shell mới không thừa hưởng biến phiên Claude cha (claude con phải chạy như phiên gõ tay)', () => {
  const env = shellEnv({ PATH: '/bin', HOME: '/h', CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_CODE_SESSION_ID: 'x', CLAUDE_PID: '9', ANTHROPIC_MODEL: 'm' });
  assert.deepStrictEqual(Object.keys(env).sort(), ['ANTHROPIC_MODEL', 'HOME', 'LANG', 'PATH', 'TERM']);
  assert.strictEqual(env.TERM, 'xterm-256color');
});
