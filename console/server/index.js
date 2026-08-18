const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');

const { DIST, AGENT_AUTO, PTY_CWD, file } = require('./lib/paths');
const { attachTerminal } = require('./ws/terminal');
const { syncMetrics } = require('./lib/learn');
const { listenWithFallback } = require('./lib/listen');
const { readJSON, readJSONL, todayStr } = require('./lib/fsutil');
const { appendJSONL } = require('./lib/backup');
const { buildAlerts } = require('./lib/alerts');
const { notifyNewCrits, sendNotification } = require('./lib/notify');
const { readAllNeedYou } = require('./lib/board');
const { buildDebt } = require('./lib/debt');

// Credential Jira (JIRA_EMAIL/JIRA_TOKEN) cho nút đánh Done. Không có file cũng chạy bình thường
// — chỉ mỗi nút Done báo thiếu token. File nằm trong .gitignore.
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // chưa tạo .env — đúng trạng thái mặc định, không phải lỗi
}

const PORT = Number(process.env.CONSOLE_PORT) || 4747;
const HOST = '127.0.0.1';
const PORT_TRIES = 10;
const METRICS_EVERY_MS = 6 * 3600 * 1000;
const NOTIFY_EVERY_MS = 60 * 1000; // cùng nhịp với TTL cache của /api/alerts

const app = express();
app.use(express.json());

// Bundle webpack
app.use(express.static(DIST));

// API
app.use('/api', require('./routes/state'));
app.use('/api', require('./routes/git'));
app.use('/api', require('./routes/activity'));
app.use('/api', require('./routes/months'));
app.use('/api', require('./routes/docs'));
app.use('/api', require('./routes/open'));
app.use('/api', require('./routes/review'));
app.use('/api', require('./routes/board'));
app.use('/api', require('./routes/alerts'));
app.use('/api', require('./routes/learn'));
app.use('/api', require('./routes/ticket'));
app.use('/api', require('./routes/doctor'));
app.use('/api', require('./routes/handoff'));
app.use('/api', require('./routes/jira'));
// "Có gì mới": đọc history/issues.jsonl + history/phases.jsonl, không đụng gì khác (Task 8)
app.use('/api', require('./routes/delta'));
// Radar nền (launchd → tools/radar-tick.mjs): đọc sổ history/radar.jsonl + công tắc bật/tắt
app.use('/api', require('./routes/radar'));
app.use('/api', require('./routes/debt'));
app.use('/api', require('./routes/bugs'));
// Serve dist/ thật của ticket (ngoài /api vì đây là trang web, không phải JSON)
app.use('/', require('./routes/preview'));

// SPA fallback (chỉ khi đã build)
app.get('*', (_req, res) => {
  const indexFile = DIST + '/index.html';
  if (!fs.existsSync(indexFile)) {
    return res
      .status(503)
      .type('text/plain')
      .send('Chưa build frontend. Chạy: npm run build (hoặc npm run dev để watch), rồi tải lại trang.');
  }
  res.sendFile(indexFile);
});

const server = http.createServer(app);

/** Vòng học: ghi metrics đo-từ-git 1 lần/ngày/ticket (không phụ thuộc `/daily wrap`) */
async function metricsTick() {
  try {
    const n = await syncMetrics();
    if (n) console.log(`  metrics: +${n} bản ghi (đo từ git)`);
  } catch (err) {
    console.log('  ⚠ metrics lỗi: ' + err.message);
  }
}

/**
 * Nhắc mốc RA NGOÀI trang — chạy ngay cả khi không ai mở console.
 *
 * Trước đây cảnh báo crit chỉ hiện qua `onNotify` phía client lúc trang mất focus: đóng tab
 * là im re, mà mốc HTML thì không đợi ai mở tab. Vòng soi này thay việc đó bằng server tự
 * kiểm 60s/lần và bắn notification macOS khi có alert `crit` MỚI (chưa nhắc trong 12h qua).
 *
 * `activity` truyền `{}`: lib/activity.js chỉ phơi `activityForIssue` (tính cho 1 ticket),
 * không có hàm dựng map cho MỌI ticket — hàm dựng map đó nằm trong routes/alerts.js, không
 * phải chỗ mình được đụng vào ở task này. Hệ quả: cảnh báo "đứng yên" (code `stale`/`no-commit`,
 * mức `warn`) sẽ không được tính ở vòng soi ngầm này — nhưng vòng soi chỉ quan tâm `crit`
 * (mốc HTML gấp/quá hạn, design quá hạn) nên không bị ảnh hưởng.
 */
async function notifyTick() {
  try {
    const state = readJSON(file.state, { issues: {} });
    const today = todayStr();
    // Nợ đọng dựng tại đây (đọc board, rẻ) để nó cũng được nhắc RA NGOÀI trang — đúng lý do
    // vòng soi này tồn tại: việc rơi khỏi radar thì không ai mở tab để thấy nó.
    const debt = buildDebt({ boards: readAllNeedYou(), today, state });
    const alerts = buildAlerts(state, today, {}, debt);
    const log = readJSONL(file.notified);
    const config = readJSON(file.config, {});
    const { sent } = notifyNewCrits({ alerts, log, nowMs: Date.now(), config });
    for (const a of sent) {
      sendNotification('Daily Console — ' + a.key, a.text);
      appendJSONL(file.notified, { at: new Date().toISOString(), key: a.key, code: a.code });
    }
  } catch (err) {
    // Không được làm sập server — server này đang host terminal thật của user
    console.log('  ⚠ notify loop lỗi: ' + err.message);
  }
}

listenWithFallback(server, {
  port: PORT,
  host: HOST,
  tries: PORT_TRIES,
  onBusy: (busy) => console.log(`  ⚠ cổng ${busy} đang bị chiếm — thử cổng kế tiếp`),
})
  .then((port) => {
    // Gắn terminal SAU khi listen xong: ws proxy lại event 'error' của http server,
    // gắn trước thì lỗi EADDRINUSE lúc dò cổng sẽ nổ trên WebSocketServer.
    attachTerminal(server, '/term');
    console.log(`Daily Console  http://${HOST}:${port}`);
    if (port !== PORT) console.log(`  (cổng mặc định ${PORT} bận — đã chuyển sang ${port})`);
    console.log(`  agent-auto: ${AGENT_AUTO}`);
    console.log(`  pty cwd   : ${PTY_CWD}`);
    if (!fs.existsSync(DIST + '/index.html')) console.log('  ⚠ chưa có dist/ — chạy npm run build');
    metricsTick();
    setInterval(metricsTick, METRICS_EVERY_MS);
    notifyTick();
    setInterval(notifyTick, NOTIFY_EVERY_MS);

    // Soi hợp đồng state.json 1 lần lúc boot, chỉ để in cảnh báo ra log terminal — KHÔNG
    // được chặn `listen()` (import động + đọc file có thể chậm) nên đặt sau, `.catch(() => {})`
    // nuốt lỗi vì đây chỉ là tiện ích log, /api/doctor mới là nguồn thật cho UI.
    import(path.join(AGENT_AUTO, 'tools', 'state-doctor.mjs'))
      .then(({ runDoctor }) => {
        const r = runDoctor({ root: AGENT_AUTO });
        if (r.errors.length) console.log(`  ⚠ state-doctor: ${r.errors.length} ERROR — mở /api/doctor để xem`);
      })
      .catch(() => {});
  })
  .catch((err) => {
    console.error(`✖ Không listen được cổng nào trong dải ${PORT}–${PORT + PORT_TRIES}: ${err.message}`);
    process.exit(1);
  });
