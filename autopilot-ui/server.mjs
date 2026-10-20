#!/usr/bin/env node
// Server riêng cho trang autopilot — tách khỏi console 4747, không phụ thuộc express
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { listView, listArtifacts, artifactFile, actionArgs } from './api.mjs';
import { runsDir } from '../tools/lib/autopilot/store.mjs';

const PORT = Number(process.env.AUTOPILOT_UI_PORT) || 4800;
const PAGE = path.join(import.meta.dirname, 'index.html');
const CLI = path.join(import.meta.dirname, '..', 'tools', 'autopilot.mjs');
const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/;

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

export function createServer({ spawnCli = spawnDetached } = {}) {
  return http.createServer(async (req, res) => {
    if (!LOCAL_HOST.test(req.headers.host ?? '')) return send(res, 403, { error: 'host lạ' });
    const { pathname } = new URL(req.url, 'http://x');
    const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (req.method === 'GET' && (pathname === '/' || pathname === '/autopilot')) return send(res, 200, fs.readFileSync(PAGE, 'utf8'), 'text/html; charset=utf-8');
    if (parts[0] !== 'api' || parts[1] !== 'autopilot') return send(res, 404, { error: 'không có' });

    if (req.method === 'GET' && parts[2] === 'runs' && parts.length === 3) return send(res, 200, await listView());
    if (req.method === 'GET' && parts[2] === 'runs' && parts[5] === 'artifacts') {
      if (parts.length === 6) return send(res, 200, listArtifacts(parts[3], parts[4]));
      const file = artifactFile(parts[3], parts[4], parts[6] ?? '');
      return file ? send(res, 200, fs.readFileSync(file, 'utf8'), 'text/plain; charset=utf-8') : send(res, 404, 'không có artifact', 'text/plain; charset=utf-8');
    }
    if (req.method === 'POST' && parts.length === 3) {
      if (!String(req.headers['content-type']).startsWith('application/json')) return send(res, 415, { error: 'cần JSON' });
      try {
        const args = actionArgs(parts[2], JSON.parse((await readBody(req)) || '{}'));
        return send(res, 200, { ok: true, ...spawnCli(args) });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }
    send(res, 404, { error: 'không có' });
  });
}

if (import.meta.filename === process.argv[1]) {
  createServer().listen(PORT, '127.0.0.1', () => console.log(`Autopilot UI  http://127.0.0.1:${PORT}`));
}
