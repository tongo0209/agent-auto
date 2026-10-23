import { test, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

process.env.AUTOPILOT_RUNS_DIR = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ap-ev-')), 'runs');
const { runEvents } = await import('./run-events.mjs');

const WAIT_MS = 5000;
const servers = [];
after(() => servers.forEach((s) => s.close()));

async function waitFor(check, what) {
  const deadline = Date.now() + WAIT_MS;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`hết giờ chờ: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function serve(handler) {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${server.address().port}`;
}

function connect(url) {
  const events = [];
  let read = 0;
  const req = http.get(url, (res) => {
    let buffer = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const lines = buffer.slice(0, end).split('\n');
        buffer = buffer.slice(end + 2);
        const event = lines.find((l) => l.startsWith('event: '))?.slice(7);
        const data = lines.find((l) => l.startsWith('data: '))?.slice(6);
        if (event) events.push({ event, data: JSON.parse(data) });
      }
    });
  });
  req.on('error', () => {});
  return {
    events,
    async next() {
      await waitFor(() => events.length > read, `sự kiện thứ ${read + 1}`);
      return events[read++];
    },
    close: () => req.destroy(),
  };
}

const watcherCount = () => process.getActiveResourcesInfo().filter((r) => r === 'FSEventWrap').length;

function tempRuns() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-ev-runs-'));
  let calls = 0;
  const list = () => {
    calls++;
    return { runs: fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('run.json')).sort() };
  };
  return { dir, list, calls: () => calls };
}

test('mặc định: tạo thư mục runs nếu chưa có, gửi snapshot listView ngay', async () => {
  const url = await serve(runEvents());
  const client = connect(url);
  const first = await client.next();
  client.close();
  assert.strictEqual(first.event, 'runs');
  assert.deepStrictEqual(first.data.runs, []);
  assert.ok(Array.isArray(first.data.flows));
  assert.ok(fs.existsSync(process.env.AUTOPILOT_RUNS_DIR));
});

test('ghi run.json mới → client nhận danh sách mới; ghi .log → không gửi', async () => {
  const runs = tempRuns();
  const url = await serve(runEvents({ list: runs.list, dir: () => runs.dir }));
  const client = connect(url);
  assert.deepStrictEqual((await client.next()).data.runs, []);

  fs.mkdirSync(path.join(runs.dir, 'GW-1', 'r1'), { recursive: true });
  fs.writeFileSync(path.join(runs.dir, 'GW-1', 'r1', 'run.json'), '{}');
  assert.deepStrictEqual((await client.next()).data.runs, [path.join('GW-1', 'r1', 'run.json')]);

  const callsBeforeLog = runs.calls();
  fs.appendFileSync(path.join(runs.dir, 'GW-1', 'r1', 'build-r1.log'), 'dòng log\n');
  await waitFor(() => runs.calls() > callsBeforeLog, 'list() chạy lại sau khi ghi log');

  fs.mkdirSync(path.join(runs.dir, 'GW-2', 'r1'), { recursive: true });
  fs.writeFileSync(path.join(runs.dir, 'GW-2', 'r1', 'run.json'), '{}');
  const next = await client.next();
  client.close();
  assert.deepStrictEqual(next.data.runs, [path.join('GW-1', 'r1', 'run.json'), path.join('GW-2', 'r1', 'run.json')], 'sự kiện kế sau .log phải là run mới, không phải bản lặp');
});

test('list() ném lỗi → event: error, process vẫn sống, hết lỗi thì gửi lại danh sách', async () => {
  const runs = tempRuns();
  let broken = true;
  const list = () => {
    if (broken) throw new Error('flow hỏng');
    return runs.list();
  };
  const url = await serve(runEvents({ list, dir: () => runs.dir }));
  const client = connect(url);
  assert.deepStrictEqual(await client.next(), { event: 'error', data: { message: 'flow hỏng' } });

  broken = false;
  fs.writeFileSync(path.join(runs.dir, 'run.json'), '{}');
  assert.deepStrictEqual(await client.next(), { event: 'runs', data: { runs: ['run.json'] } });
  client.close();
});

test('nhiều client dùng chung 1 watcher, hết client thì dọn watcher', async () => {
  const runs = tempRuns();
  const url = await serve(runEvents({ list: runs.list, dir: () => runs.dir }));
  await waitFor(() => watcherCount() === 0, 'watcher của test trước đã dọn');

  const a = connect(url);
  const b = connect(url);
  await a.next();
  await b.next();
  assert.strictEqual(watcherCount(), 1);

  a.close();
  fs.writeFileSync(path.join(runs.dir, 'run.json'), '{}');
  assert.deepStrictEqual((await b.next()).data.runs, ['run.json']);
  assert.strictEqual(watcherCount(), 1);

  b.close();
  await waitFor(() => watcherCount() === 0, 'watcher dọn khi hết client');
});

test('thư mục runs bị xoá rồi tạo lại → vẫn theo dõi tiếp', async () => {
  const runs = tempRuns();
  const url = await serve(runEvents({ list: runs.list, dir: () => runs.dir }));
  const client = connect(url);
  await client.next();

  fs.rmSync(runs.dir, { recursive: true });
  await waitFor(() => fs.existsSync(runs.dir), 'dựng lại thư mục runs');
  fs.writeFileSync(path.join(runs.dir, 'run.json'), '{}');
  await waitFor(() => client.events.at(-1)?.data.runs?.includes('run.json'), 'nhận run sau khi dựng lại');
  client.close();
});
