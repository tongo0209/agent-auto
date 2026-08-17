import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULTS,
  shouldRunNow,
  lockState,
  humanBusy,
  countLines,
  diffCounts,
  failStreak,
  decideNotify,
  buildArgs,
  runTick,
  ALLOWED_TOOLS,
} from './radar-tick.mjs';

/** 10/8/2026 là thứ Hai — `at(0,…)` = T2, `at(5,…)` = T7, `at(6,…)` = CN */
const at = (day, h, m = 0) => new Date(2026, 7, 10 + day, h, m);
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

// ---------- Cổng ①: giờ ----------

test('cổng giờ: trong khung T2-T6 08:00-18:00 thì chạy', () => {
  assert.equal(shouldRunNow(at(0, 8, 0), DEFAULTS).run, true);
  assert.equal(shouldRunNow(at(4, 18, 0), DEFAULTS).run, true); // mép phải vẫn chạy
});

test('cổng giờ: ngoài khung thì không chạy, và nói rõ vì sao', () => {
  assert.deepEqual(shouldRunNow(at(0, 7, 59), DEFAULTS), { run: false, why: 'off-hours' });
  assert.deepEqual(shouldRunNow(at(0, 18, 1), DEFAULTS), { run: false, why: 'off-hours' });
  assert.deepEqual(shouldRunNow(at(5, 10, 0), DEFAULTS), { run: false, why: 'off-day' });
  assert.deepEqual(shouldRunNow(at(6, 10, 0), DEFAULTS), { run: false, why: 'off-day' });
});

test('cổng giờ: công tắc tắt thì thắng mọi thứ', () => {
  assert.deepEqual(shouldRunNow(at(0, 10, 0), { ...DEFAULTS, enabled: false }), {
    run: false,
    why: 'disabled',
  });
});

// ---------- Cổng ②: lock ----------

test('cổng lock: không file = free, mới = busy, quá hạn = stale', () => {
  const lock = path.join(tmp('radar-'), 'radar.lock');
  const now = 1_000_000_000_000;
  assert.equal(lockState(lock, now, 60_000), 'free');
  fs.writeFileSync(lock, JSON.stringify({ pid: 1, atMs: now - 10_000 }));
  assert.equal(lockState(lock, now, 60_000), 'busy');
  fs.writeFileSync(lock, JSON.stringify({ pid: 1, atMs: now - 999_000 }));
  assert.equal(lockState(lock, now, 60_000), 'stale');
});

test('cổng lock: file hỏng coi như stale, không được kẹt vĩnh viễn', () => {
  const lock = path.join(tmp('radar-'), 'radar.lock');
  fs.writeFileSync(lock, 'không phải json');
  assert.equal(lockState(lock, Date.now(), 60_000), 'stale');
});

// ---------- Cổng ③: người đang gõ tay ----------

test('cổng người: file vừa đổi thì nhường, cũ thì thôi; file không có không tính là bận', () => {
  const d = tmp('radar-');
  const f = path.join(d, 'state.json');
  fs.writeFileSync(f, '{}');
  assert.equal(humanBusy([f], Date.now(), 3 * 60e3), true);
  assert.equal(humanBusy([f], Date.now() + 10 * 60e3, 3 * 60e3), false);
  assert.equal(humanBusy([path.join(d, 'không-có.json')], Date.now(), 3 * 60e3), false);
});

// ---------- Đo thay đổi ----------

test('đếm dòng jsonl: file không có = 0, dòng trống không tính', () => {
  const f = path.join(tmp('radar-'), 'a.jsonl');
  assert.equal(countLines(f), 0);
  fs.writeFileSync(f, '{"a":1}\n{"a":2}\n\n');
  assert.equal(countLines(f), 2);
});

test('có dòng mới = có thay đổi thật', () => {
  assert.deepEqual(diffCounts({ issues: 5, phases: 2 }, { issues: 8, phases: 2 }), {
    changed: true,
    newRows: { issues: 3 },
  });
  assert.deepEqual(diffCounts({ issues: 5, phases: 2 }, { issues: 5, phases: 2 }), {
    changed: false,
    newRows: {},
  });
});

// ---------- Quyết định báo ----------

test('chuỗi hỏng: đếm ngược tới lượt OK gần nhất, bỏ qua lượt bị bỏ', () => {
  assert.equal(failStreak([{ ok: true }, { ok: false }, { skipped: 'locked' }, { ok: false }]), 2);
  assert.equal(failStreak([{ ok: false }, { ok: true }]), 0);
  assert.equal(failStreak([]), 0);
});

test('lỗi đăng nhập phải báo NGAY, không đợi đủ 3 lượt', () => {
  assert.deepEqual(decideNotify({ ok: false, err: 'Invalid API key · Please run /login', streak: 1 }), {
    send: true,
    kind: 'auth',
  });
});

test('hỏng lặt vặt thì im, đủ 3 lượt liên tiếp mới báo', () => {
  assert.equal(decideNotify({ ok: false, err: 'timeout', streak: 2 }).send, false);
  assert.deepEqual(decideNotify({ ok: false, err: 'timeout', streak: 3 }), { send: true, kind: 'dead' });
});

test('chạy được thì chỉ báo khi có thay đổi thật', () => {
  assert.deepEqual(decideNotify({ ok: true, changed: true, streak: 0 }), { send: true, kind: 'change' });
  assert.equal(decideNotify({ ok: true, changed: false, streak: 0 }).send, false);
});

// ---------- Thân lượt chạy ----------

/** agent-auto giả: đủ config + state + 2 folder, không đụng gì của user */
function root(cfg = {}) {
  const d = tmp('radar-root-');
  fs.mkdirSync(path.join(d, 'history'), { recursive: true });
  fs.mkdirSync(path.join(d, 'boards'), { recursive: true });
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify({ radar: { ...DEFAULTS, ...cfg } }));
  fs.writeFileSync(path.join(d, 'state.json'), '{}');
  fs.utimesSync(path.join(d, 'state.json'), new Date(0), new Date(0)); // cũ sẵn, khỏi vướng cổng ③
  return d;
}
const monday = new Date(2026, 7, 10, 10, 0);

test('whitelist phải có Skill — thiếu là không nạp được /daily, tick chết câm', () => {
  assert.match(ALLOWED_TOOLS, /(^|,)Skill(,|$)/);
  assert.deepEqual(buildArgs('/daily delta').slice(0, 2), ['-p', '/daily delta']);
  assert.ok(buildArgs('/daily delta').includes('--output-format'));
});

test('model để trống thì KHÔNG truyền --model (giữ mặc định của phiên)', () => {
  assert.equal(buildArgs('/daily delta').includes('--model'), false);
  assert.deepEqual(buildArgs('/daily delta', 'sonnet').slice(-2), ['--model', 'sonnet']);
});

test('ngoài giờ: không gọi claude và KHÔNG ghi sổ', () => {
  const d = root();
  let called = 0;
  const row = runTick({ root: d, now: new Date(2026, 7, 8, 10, 0), runClaude: () => (called = 1) });
  assert.equal(called, 0);
  assert.equal(row.skipped, 'off-day');
  assert.equal(countLines(path.join(d, 'history/radar.jsonl')), 0);
});

test('đang bận (lock): bỏ lượt nhưng CÓ ghi sổ để còn truy được', () => {
  const d = root();
  fs.mkdirSync(path.join(d, '.locks'), { recursive: true });
  fs.writeFileSync(path.join(d, '.locks/radar.lock'), JSON.stringify({ pid: 9, atMs: monday.getTime() }));
  let called = 0;
  const row = runTick({ root: d, now: monday, runClaude: () => (called = 1) });
  assert.equal(called, 0);
  assert.equal(row.skipped, 'locked');
  assert.equal(countLines(path.join(d, 'history/radar.jsonl')), 1);
});

test('chạy xong: ghi sổ, phát hiện dòng mới, bắn báo, và NHẢ LOCK', () => {
  const d = root();
  const sent = [];
  const row = runTick({
    root: d,
    now: monday,
    notify: (t, m) => sent.push([t, m]),
    runClaude: () => {
      fs.appendFileSync(path.join(d, 'history/issues.jsonl'), '{"key":"GW-1"}\n');
      return { ok: true, ms: 4200, costUsd: 0.1, err: null };
    },
  });
  assert.equal(row.ok, true);
  assert.equal(row.changed, true);
  assert.deepEqual(row.newRows, { issues: 1 });
  assert.equal(sent.length, 1);
  assert.equal(fs.existsSync(path.join(d, '.locks/radar.lock')), false);
  assert.equal(countLines(path.join(d, 'history/radar.jsonl')), 1);
});

test('claude ném lỗi: vẫn ghi sổ và vẫn nhả lock', () => {
  const d = root();
  const row = runTick({
    root: d,
    now: monday,
    runClaude: () => {
      throw new Error('bùm');
    },
  });
  assert.equal(row.ok, false);
  assert.match(row.err, /bùm/);
  assert.equal(fs.existsSync(path.join(d, '.locks/radar.lock')), false);
});

test('--force vẫn quét tay được dù lượt này lẽ ra bị bỏ vì không sheet nào nóng', () => {
  const root = tmp('radar-forced-');
  const statePath = path.join(root, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ bugWatch: { s1: { heat: 'warm' } } }));
  fs.utimesSync(statePath, 0, 0);
  const seen = [];
  const row = runTick({
    root,
    now: at(0, 14, 45),
    argv: ['--force'],
    runClaude: (prompt) => {
      seen.push(prompt);
      return { ok: true, ms: 1, costUsd: 0 };
    },
    notify: () => {},
  });
  assert.equal(row.skipped, null);
  assert.deepEqual(seen, ['/daily delta']);
});

test('lượt nửa giờ không có sheet nóng thì bỏ lượt và KHÔNG gọi claude', () => {
  const root = tmp('radar-cold-');
  const statePath = path.join(root, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ bugWatch: { s1: { heat: 'warm' } } }));
  fs.utimesSync(statePath, 0, 0);
  let called = 0;
  const row = runTick({
    root,
    now: at(0, 14, 45),
    runClaude: () => {
      called++;
      return { ok: true, ms: 1 };
    },
    notify: () => {},
  });
  assert.equal(row.skipped, 'cold');
  assert.equal(called, 0);
});

test('có sheet nóng ở lượt nửa giờ ⇒ chạy prompt bugwatch chứ không phải delta', () => {
  const root = tmp('radar-hot-');
  const statePath = path.join(root, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ bugWatch: { s1: { heat: 'hot' } } }));
  fs.utimesSync(statePath, 0, 0);
  const seen = [];
  runTick({
    root,
    now: at(0, 14, 45),
    runClaude: (prompt) => {
      seen.push(prompt);
      return { ok: true, ms: 1 };
    },
    notify: () => {},
  });
  assert.deepEqual(seen, ['/daily bugwatch']);
});
