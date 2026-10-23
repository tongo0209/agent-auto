// SSE /api/autopilot/events: đẩy listView() xuống trang mỗi khi runs/ đổi, thay cho poll 4s
import fs from 'node:fs';
import { listView } from './api.mjs';
import { runsDir } from '../tools/lib/autopilot/store.mjs';

const HEARTBEAT_MS = 25_000;
const REWATCH_MS = 1000;

const send = (res, { event, data }) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export function runEvents({ list = listView, dir = runsDir, debounceMs = 300 } = {}) {
  const clients = new Set();
  let watcher = null;
  let heartbeat = null;
  let debounce = null;
  let rewatch = null;
  let lastSignature = null;
  // xếp hàng: snapshot chào client mới và broadcast không chen nhau, giữ thứ tự
  let queue = Promise.resolve();
  const enqueue = (job) => (queue = queue.then(job).catch((e) => console.error(`${new Date().toISOString()} đẩy SSE lỗi`, e.message)));

  async function snapshot() {
    try {
      return { event: 'runs', data: await list() };
    } catch (e) {
      return { event: 'error', data: { message: e.message } };
    }
  }

  async function broadcast() {
    const message = await snapshot();
    const signature = JSON.stringify(message);
    if (signature === lastSignature) return;
    lastSignature = signature;
    for (const res of clients) send(res, message);
  }

  function onChange() {
    clearTimeout(debounce);
    debounce = setTimeout(() => (fs.existsSync(dir()) ? enqueue(broadcast) : restartWatch()), debounceMs);
  }

  function startWatch() {
    try {
      fs.mkdirSync(dir(), { recursive: true });
      watcher = fs.watch(dir(), { recursive: true }, onChange);
      watcher.on('error', (e) => {
        console.error(`${new Date().toISOString()} theo dõi ${dir()} lỗi, dựng lại`, e.message);
        restartWatch();
      });
    } catch (e) {
      console.error(`${new Date().toISOString()} không theo dõi được ${dir()}, thử lại`, e.message);
      restartWatch();
    }
  }

  function restartWatch() {
    watcher?.close();
    watcher = null;
    clearTimeout(rewatch);
    rewatch = setTimeout(() => {
      startWatch();
      // thay đổi lọt giữa lúc mất watcher và lúc dựng lại
      enqueue(broadcast);
    }, REWATCH_MS);
  }

  function stop() {
    watcher?.close();
    watcher = null;
    lastSignature = null;
    clearInterval(heartbeat);
    clearTimeout(debounce);
    clearTimeout(rewatch);
  }

  return (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    if (clients.size === 0) {
      heartbeat = setInterval(() => clients.forEach((c) => c.write(': ping\n\n')), HEARTBEAT_MS);
      startWatch();
    }
    clients.add(res);
    enqueue(async () => {
      const message = await snapshot();
      lastSignature ??= JSON.stringify(message);
      if (clients.has(res)) send(res, message);
    });
    req.on('close', () => {
      clients.delete(res);
      if (clients.size === 0) stop();
    });
  };
}
