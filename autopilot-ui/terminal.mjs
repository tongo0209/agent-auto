// Bản của console/server/ws/terminal.js, khác đúng một chỗ: socket cũ đóng muộn sau reload không được gỡ socket mới
import { consoleRequire } from './console-root.mjs';
import { panelClaude } from './panel-claude.mjs';

const { WebSocketServer } = consoleRequire('ws');
const pty = consoleRequire('node-pty');
const { PTY_CWD, file } = consoleRequire('./lib/paths');
const { createPtyStore } = consoleRequire('./lib/ptyStore');
const { readJSON } = consoleRequire('./lib/fsutil');
const { isAllowedOrigin } = consoleRequire('./ws/terminal');

const REPLAY_BYTES = 256 * 1024;
const SESSION_TTL_MS = 6 * 3600 * 1000;
const SWEEP_EVERY_MS = 10 * 60 * 1000;

export const shellEnv = (env) => ({
  ...Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('CLAUDE'))),
  TERM: 'xterm-256color',
  LANG: 'en_US.UTF-8',
});

export function attachTerminal(server, wsPath) {
  const wss = new WebSocketServer({
    server,
    path: wsPath,
    verifyClient: ({ origin }, done) => done(isAllowedOrigin(origin, server.address().port), 403),
  });
  const store = createPtyStore({
    spawn: ({ cols, rows }) =>
      pty.spawn(process.env.SHELL || '/bin/zsh', ['-l'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: PTY_CWD,
        env: shellEnv(process.env),
      }),
    now: () => Date.now(),
    ttlMs: SESSION_TTL_MS,
    bufferBytes: REPLAY_BYTES,
  });
  setInterval(() => store.sweep(), SWEEP_EVERY_MS).unref();
  const owners = new Map();

  wss.on('connection', (ws, req) => {
    const send = (payload) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(payload));
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id') || `anon-${Date.now()}`;
    const startup = url.searchParams.get('startup') === '1' ? readJSON(file.config, {}).terminal?.startupCommand || '' : '';

    const { fresh, replay, error } = store.attach(id, { send }, { cols: 100, rows: 30 });
    if (error) {
      send({ type: 'output', data: `\r\n[console] Không spawn được shell: ${error}\r\n` });
      return ws.close();
    }
    owners.set(id, ws);
    if (replay) send({ type: 'output', data: replay });
    send({ type: 'attached', fresh, resumed: !fresh, startup, claude: panelClaude() });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === 'input') store.write(id, msg.data);
      if (msg.type === 'resize' && msg.cols > 0 && msg.rows > 0) store.resize(id, msg.cols, msg.rows);
      if (msg.type === 'kill') store.kill(id);
    });
    ws.on('close', () => {
      if (owners.get(id) !== ws) return;
      owners.delete(id);
      store.detach(id);
    });
  });
  return wss;
}
