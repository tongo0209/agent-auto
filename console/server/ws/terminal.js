const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const { PTY_CWD, file } = require('../lib/paths');
const { createPtyStore } = require('../lib/ptyStore');
const { readJSON } = require('../lib/fsutil');

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;
/** Phát lại tối đa chừng này ký tự sau reload — đủ vài màn hình, không phình theo phiên cả ngày */
const REPLAY_BYTES = 256 * 1024;
/**
 * Rời dây quá lâu mới dọn. Để dài vì đóng trình duyệt KHÔNG có nghĩa là bỏ việc: `/loop 30m
 * /daily delta` hay một lượt agent dài vẫn phải chạy tiếp. Server restart thì dọn sạch sẵn.
 */
const SESSION_TTL_MS = 6 * 3600 * 1000;
const SWEEP_EVERY_MS = 10 * 60 * 1000;

/**
 * WebSocket không bị CORS chặn: thiếu kiểm này thì trang web bất kỳ đang mở trên trình duyệt
 * cũng nối được vào /term và gõ lệnh trên máy. Không có Origin = client không phải trình duyệt.
 */
function isAllowedOrigin(origin, port) {
  if (origin === undefined) return true;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

/**
 * Mỗi WebSocket = một ĐƯỜNG DÂY nối vào phiên pty (zsh login), không phải chủ sở hữu phiên.
 * Spawn zsh chứ không spawn thẳng `claude` để user tự chủ: claude thoát thì shell còn sống.
 * Phiên neo theo `?id=` do client giữ trong localStorage nên reload trang không giết claude —
 * xem lib/ptyStore.js.
 */
function attachTerminal(server, wsPath = '/term') {
  const wss = new WebSocketServer({
    server,
    path: wsPath,
    verifyClient: ({ origin }, done) => done(isAllowedOrigin(origin, server.address().port), 403),
  });

  const store = createPtyStore({
    spawn: ({ cols, rows }) =>
      pty.spawn(process.env.SHELL || '/bin/zsh', ['-l'], {
        name: 'xterm-256color',
        cols: cols || DEFAULT_COLS,
        rows: rows || DEFAULT_ROWS,
        cwd: PTY_CWD,
        env: { ...process.env, TERM: 'xterm-256color', LANG: 'en_US.UTF-8' },
      }),
    now: () => Date.now(),
    ttlMs: SESSION_TTL_MS,
    bufferBytes: REPLAY_BYTES,
  });

  const sweeper = setInterval(() => store.sweep(), SWEEP_EVERY_MS);
  sweeper.unref?.();

  wss.on('connection', (ws, req) => {
    const send = (payload) => {
      try {
        ws.send(JSON.stringify(payload));
      } catch {
        // Client đã đóng tab/socket giữa lúc pty còn bắn data — không có ai nhận cũng không sao
      }
    };
    // Client tự sinh id và giữ trong localStorage; không có id thì mỗi lần nối là một phiên mới
    // (giữ được hành vi cũ cho mọi thứ gọi thẳng /term).
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id') || 'anon-' + Date.now();
    const startup =
      url.searchParams.get('startup') === '1' ? readJSON(file.config, {}).terminal?.startupCommand || '' : '';

    const { fresh, replay, error } = store.attach(id, { send }, { cols: DEFAULT_COLS, rows: DEFAULT_ROWS });
    if (error) {
      // node-pty fail (vd bản không tương thích Node) → báo vào terminal, không để server sập
      send({ type: 'output', data: '\r\n[console] Không spawn được shell: ' + error + '\r\n' });
      ws.close();
      return;
    }
    if (replay) send({ type: 'output', data: replay });
    send({ type: 'attached', fresh, resumed: !fresh, startup });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === 'input') store.write(id, msg.data);
      if (msg.type === 'resize' && msg.cols > 0 && msg.rows > 0) store.resize(id, msg.cols, msg.rows);
      // Đóng tab terminal trong UI là chủ ý giết phiên — reload thì KHÔNG gửi cái này
      if (msg.type === 'kill') store.kill(id);
    });

    ws.on('close', () => store.detach(id));
  });

  return wss;
}

module.exports = { attachTerminal, isAllowedOrigin };
