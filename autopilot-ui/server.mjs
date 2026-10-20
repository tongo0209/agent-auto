#!/usr/bin/env node
// Console mới: trang autopilot + mọi API/terminal của console cũ (dùng lại router của console/server)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { listView, listArtifacts, artifactFile, actionArgs, liveLog } from './api.mjs';
import { runsDir } from '../tools/lib/autopilot/store.mjs';
import { attachTerminal } from './terminal.mjs';
import { CONSOLE, consoleRequire } from './console-root.mjs';

const PORT = Number(process.env.AUTOPILOT_UI_PORT) || 4800;
const WEB = path.join(import.meta.dirname, 'web');
const CLI = path.join(import.meta.dirname, '..', 'tools', 'autopilot.mjs');
const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/;
const express = consoleRequire('express');
const CONSOLE_ROUTES = ['state', 'git', 'activity', 'months', 'docs', 'open', 'review', 'board', 'alerts', 'learn', 'ticket', 'doctor', 'handoff', 'jira', 'delta', 'radar', 'debt', 'bugs', 'queue', 'finish'];

try {
  process.loadEnvFile(path.join(CONSOLE, '.env'));
} catch {}

// CLI chạy tách nền vì 1 lượt duyệt kéo theo nhiều stage claude — trang tự poll thấy mốc dừng kế tiếp
function spawnDetached(args) {
  fs.mkdirSync(runsDir(), { recursive: true });
  const log = path.join(runsDir(), `ui-${Date.now()}.log`);
  const out = fs.openSync(log, 'a');
  const child = spawn(process.execPath, [CLI, ...args], { cwd: path.dirname(CLI), detached: true, stdio: ['ignore', out, out] });
  child.unref();
  return { pid: child.pid, log };
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw));
  });

async function handleAutopilot(req, res, spawnCli) {
    const { pathname } = new URL(req.originalUrl, 'http://x');
    const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (req.method === 'GET' && parts[2] === 'runs' && parts.length === 3) return send(res, 200, await listView());
    if (req.method === 'GET' && parts[2] === 'runs' && parts[5] === 'live') {
      const live = liveLog(parts[3], parts[4], parts[6]);
      return live ? send(res, 200, live) : send(res, 204, '');
    }
    if (req.method === 'GET' && parts[2] === 'runs' && parts[5] === 'artifacts') {
      if (parts.length === 6) return send(res, 200, listArtifacts(parts[3], parts[4]));
      const file = artifactFile(parts[3], parts[4], parts[6] ?? '');
      return file ? send(res, 200, fs.readFileSync(file, 'utf8'), 'text/plain; charset=utf-8') : send(res, 404, 'không có artifact', 'text/plain; charset=utf-8');
    }
    if (req.method === 'POST' && parts.length === 3) {
      if (!String(req.headers['content-type']).startsWith('application/json')) return send(res, 415, { error: 'cần JSON' });
      try {
        const args = actionArgs(parts[2], JSON.parse((await readBody(req)) || '{}'));
        console.log(`${new Date().toISOString()} ${args.join(' ')}`);
        return send(res, 200, { ok: true, ...spawnCli(args) });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }
    send(res, 404, { error: 'không có' });
}

export function createServer({ spawnCli = spawnDetached, allowWrites = process.env.AUTOPILOT_LAB_WRITES === '1' } = {}) {
  const app = express();
  app.use((req, res, next) => (LOCAL_HOST.test(req.headers.host ?? '') ? next() : send(res, 403, { error: 'host lạ' })));
  // autopilot đi trước cổng chặn ghi: run chạy trong worktree, hook sandbox chặn ghi ra source gốc
  app.use('/api/autopilot', (req, res) => handleAutopilot(req, res, spawnCli));
  app.use('/api', (req, res, next) =>
    allowWrites || req.method === 'GET' ? next() : send(res, 403, { error: 'Bản thử (agent-auto-lab) chặn ghi dữ liệu thật. Chạy với AUTOPILOT_LAB_WRITES=1 nếu thật sự muốn ghi.' }));
  app.use(express.json());
  for (const name of CONSOLE_ROUTES) app.use('/api', consoleRequire(`./routes/${name}`));
  app.use('/vendor/xterm', express.static(path.join(CONSOLE, 'node_modules/@xterm/xterm/lib')), express.static(path.join(CONSOLE, 'node_modules/@xterm/xterm/css')));
  app.use('/vendor/xterm-fit', express.static(path.join(CONSOLE, 'node_modules/@xterm/addon-fit/lib')));
  app.use(express.static(WEB));
  app.use('/', consoleRequire('./routes/preview'));
  app.get(/^[^.]*$/, (_req, res) => res.sendFile(path.join(WEB, 'index.html')));
  return http.createServer(app);
}

if (import.meta.filename === process.argv[1]) {
  const server = createServer();
  server.listen(PORT, '127.0.0.1', () => {
    attachTerminal(server, '/term');
    console.log(`Console mới  http://127.0.0.1:${PORT}`);
  });
}
