import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { stampFixture } from '../fixtures/stamp.mjs';

const CONSOLE_ROOT = path.join(import.meta.dirname, '..');
const AGENT_AUTO = path.join(CONSOLE_ROOT, '..');
const USER_CONSOLE_PORT = 4747;
const REAL_FILES = ['state.json', 'config.json', 'knowledge/metrics.jsonl', 'history/notified.jsonl'];
const MIN_BUNDLE_BYTES = 1000;

let failed = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

const fingerprint = () =>
  REAL_FILES.map((rel) => {
    const stat = fs.statSync(path.join(AGENT_AUTO, rel));
    return `${rel}:${stat.size}@${stat.mtimeMs}`;
  }).join('\n');

async function freePort() {
  const probe = net.createServer();
  await new Promise((done) => probe.listen(0, '127.0.0.1', done));
  const { port } = probe.address();
  await new Promise((done) => probe.close(done));
  return port;
}

async function startConsole(fixture) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: CONSOLE_ROOT,
    env: {
      ...process.env,
      CONSOLE_STATE: stampFixture(fixture),
      CONSOLE_CONFIG: path.join(CONSOLE_ROOT, 'fixtures', 'config.json'),
      CONSOLE_PORT: String(await freePort()),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const port = await new Promise((resolve, reject) => {
    let log = '';
    child.stdout.on('data', (chunk) => {
      log += chunk;
      const listening = log.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (listening) resolve(Number(listening[1]));
    });
    child.on('exit', (code) => reject(new Error(`server thoát sớm (exit ${code})`)));
  });
  if (port === USER_CONSOLE_PORT) throw new Error('cổng 4747 là console thật của user — dừng');
  return { child, base: `http://127.0.0.1:${port}` };
}

async function withConsole(fixture, body) {
  const { child, base } = await startConsole(fixture);
  try {
    await body(base);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
    console.log(`  (đã dừng server PID ${child.pid})`);
  }
}

const getJSON = async (base, api) => (await fetch(base + api)).json();

const before = fingerprint();

await withConsole('reopened', async (base) => {
  const { items } = await getJSON(base, '/api/alerts');
  const reopened = items.filter((a) => a.code === 'bug-reopened');
  check('reopened: đúng 1 alert bug-reopened', reopened.length === 1, `có ${reopened.length} · ${reopened.map((a) => a.text)}`);
  check('reopened: level crit', reopened[0]?.level === 'crit', `level=${reopened[0]?.level}`);
  check(
    'reopened: alert mang sheetUrl',
    reopened[0]?.sheetUrl === 'https://sheets.example.invalid/fixture-following',
    `sheetUrl=${reopened[0]?.sheetUrl}`,
  );

  const bugs = await getJSON(base, '/api/bugs');
  const inGroup = (name) => bugs.sheets.filter((s) => s.group === name).map((s) => s.sheetId).join(',');
  check('reopened: nhóm following', inGroup('following') === 'fixture-sheet-following', inGroup('following'));
  check('reopened: nhóm off', inGroup('off') === 'fixture-sheet-off', inGroup('off'));
  check('reopened: nhóm closed', inGroup('closed') === 'fixture-sheet-closed', inGroup('closed'));
  check('reopened: 3 bug đang mở', bugs.open.counts.total === 3, JSON.stringify(bugs.open.counts));

  const page = await fetch(base + '/');
  const html = await page.text();
  check('trang / trả 200', page.status === 200, `status=${page.status}`);
  const src = html.match(/<script[^>]+src="([^"]+)"/)?.[1] || '';
  const bundle = await fetch(`${base}/${src}`);
  const code = await bundle.text();
  check(
    `bundle ${src} tải được`,
    bundle.status === 200 && /javascript/.test(bundle.headers.get('content-type')) && code.length > MIN_BUNDLE_BYTES,
    `status=${bundle.status} · ${bundle.headers.get('content-type')} · ${code.length} byte`,
  );
});

await withConsole('qc-no-buglist', async (base) => {
  const { items } = await getJSON(base, '/api/alerts');
  const qc = items.filter((a) => a.code === 'qc-test-no-buglist');
  check('qc: đúng 1 alert qc-test-no-buglist', qc.length === 1, `có ${qc.length} · ${qc.map((a) => a.text)}`);
  check('qc: level warn', qc[0]?.level === 'warn', `level=${qc[0]?.level}`);
  check('qc: đúng ticket DEMO-201', qc[0]?.key === 'DEMO-201', `key=${qc[0]?.key}`);

  const bugs = await getJSON(base, '/api/bugs');
  check(
    'qc: chưa có buglist nào trong bảng bug',
    bugs.sheets.length === 0 && bugs.open.counts.total === 0,
    `sheets=${bugs.sheets.length} · open=${bugs.open.counts.total}`,
  );
});

check('state/config/metrics/notified THẬT không bị ghi', fingerprint() === before, 'so size@mtime trước↔sau');

console.log(failed ? `\n${failed} check FAIL` : '\nTất cả check PASS');
process.exitCode = failed ? 1 : 0;
