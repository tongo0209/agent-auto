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
  pendingDelta,
  openDelta,
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
  fs.writeFileSync(statePath, JSON.stringify({ bugWatch: { s1: { follow: true, heat: 'warm' } } }));
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
  fs.writeFileSync(statePath, JSON.stringify({ bugWatch: { s1: { follow: true, heat: 'warm', lastPollAt: new Date(2026, 7, 10, 14, 0).toISOString() } } }));
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
  fs.writeFileSync(statePath, JSON.stringify({ bugWatch: { s1: { follow: true, heat: 'hot' } } }));
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

test('hàng chờ duyệt tăng ⇒ báo loại bugfix, KHÔNG để lẫn vào tin "có thay đổi" chung', () => {
  assert.deepEqual(decideNotify({ ok: true, changed: true, bugsAdded: { verified: 1, unverified: 0 } }), {
    send: true,
    kind: 'bugfix',
  });
  assert.deepEqual(decideNotify({ ok: true, changed: true, bugsAdded: { verified: 0, unverified: 2 } }), {
    send: true,
    kind: 'bugfix',
  });
  assert.equal(decideNotify({ ok: true, changed: true, bugsAdded: { verified: 0, unverified: 0 } }).kind, 'change');
});

test('hỏng hoặc hết hạn đăng nhập vẫn thắng tin bug — sửa được radar mới nói chuyện fix', () => {
  assert.equal(decideNotify({ ok: false, err: 'Invalid API key', bugsAdded: { verified: 5 } }).kind, 'auth');
  assert.equal(decideNotify({ ok: false, err: 'boom', streak: 3, bugsAdded: { verified: 5 } }).kind, 'dead');
});

test('lượt XẢ hàng đợi không được báo là có việc mới', () => {
  assert.deepEqual(pendingDelta({ verified: 3, unverified: 1 }, { verified: 0, unverified: 0 }), {
    verified: 0,
    unverified: 0,
  });
  assert.deepEqual(pendingDelta({}, { verified: 2, unverified: 1 }), { verified: 2, unverified: 1 });
  assert.deepEqual(pendingDelta({ verified: 2 }, { verified: 2 }), { verified: 0, unverified: 0 });
});

// ---------- dọn rác ghép vào lượt radar ----------

const sweepRoot = () => {
  const root = tmp('radar-sweep-');
  const statePath = path.join(root, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ bugWatch: { s1: { follow: true, heat: 'warm', lastPollAt: new Date(2026, 7, 10, 14, 0).toISOString() } } }));
  fs.utimesSync(statePath, 0, 0);
  const junk = path.join(root, '.DS_Store');
  fs.writeFileSync(junk, 'x');
  return root;
};
const sweeps = (root) => {
  try {
    return fs.readFileSync(path.join(root, 'history', 'janitor.jsonl'), 'utf8').split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
};

test('lượt radar qua cổng thì dọn rác, kể cả lượt bỏ vì sheet nguội', () => {
  const root = sweepRoot();
  const row = runTick({ root, now: at(0, 14, 45), runClaude: () => ({ ok: true, ms: 1 }), notify: () => {} });
  assert.equal(row.skipped, 'cold');
  assert.equal(sweeps(root), 1);
  assert.equal(fs.existsSync(path.join(root, '.DS_Store')), false);
});

test('dọn đúng một lần mỗi ngày, lượt sau trong ngày không dọn lại', () => {
  const root = sweepRoot();
  runTick({ root, now: at(0, 14, 45), runClaude: () => ({ ok: true, ms: 1 }), notify: () => {} });
  runTick({ root, now: at(0, 15, 45), runClaude: () => ({ ok: true, ms: 1 }), notify: () => {} });
  assert.equal(sweeps(root), 1);
});

test('lượt ngoài giờ im lặng tuyệt đối: không dọn, không ghi sổ', () => {
  const root = sweepRoot();
  runTick({ root, now: at(6, 3, 0), runClaude: () => ({ ok: true, ms: 1 }), notify: () => {} });
  assert.equal(sweeps(root), 0);
  assert.equal(fs.existsSync(path.join(root, '.DS_Store')), true);
});

test('lượt dọn có thứ cần bạn quyết thì báo ra thông báo hệ thống', () => {
  const root = sweepRoot();
  fs.mkdirSync(path.join(root, 'designs/GW-9/_raw'), { recursive: true });
  fs.writeFileSync(path.join(root, 'designs/GW-9/_raw/big.psd'), Buffer.alloc(600 * 1024 ** 2 + 1));
  fs.writeFileSync(
    path.join(root, 'state.json'),
    JSON.stringify({ bugWatch: { s1: { follow: true, heat: 'warm' } }, issues: { 'GW-9': { phase: 'closed', lastSeenUpdated: '2026-06-01T00:00:00Z' } } }),
  );
  fs.utimesSync(path.join(root, 'state.json'), 0, 0);
  const said = [];
  runTick({ root, now: at(0, 14, 45), runClaude: () => ({ ok: true, ms: 1 }), notify: (t, m) => said.push(m) });
  assert.equal(said.length, 1);
  assert.match(said[0], /GW-9/);
  assert.equal(fs.existsSync(path.join(root, 'designs/GW-9/_raw/big.psd')), true);
});

// ---------- thông báo BUG MỚI (trước 18/8 chưa từng có) ----------

test('chỉ đếm bug mở TĂNG thêm — lượt vừa fix xong không thành tin báo có bug mới', () => {
  assert.deepEqual(openDelta({ total: 2, mine: 1, unknown: 1 }, { total: 5, mine: 3, unknown: 2 }), {
    total: 3,
    chuaFix: 0,
    choConfirm: 0,
    mine: 2,
    unknown: 1,
    notMine: 0,
  });
  assert.deepEqual(openDelta({ total: 5, mine: 3, unknown: 2 }, { total: 1, mine: 0, unknown: 1 }), {
    total: 0,
    chuaFix: 0,
    choConfirm: 0,
    mine: 0,
    unknown: 0,
    notMine: 0,
  });
});

test('có bug mới thì báo bug mới, không báo "có thay đổi" chung chung', () => {
  assert.deepEqual(decideNotify({ ok: true, changed: true, openAdded: { total: 2, mine: 2 } }), {
    send: true,
    kind: 'newbug',
  });
});

test('bug mới quan trọng hơn tin fix-xong-chờ-gật', () => {
  assert.deepEqual(
    decideNotify({ ok: true, openAdded: { total: 1, mine: 1 }, bugsAdded: { verified: 3 } }),
    { send: true, kind: 'newbug' },
  );
});

test('không có bug mới thì giữ nguyên hành vi cũ', () => {
  assert.deepEqual(decideNotify({ ok: true, openAdded: { total: 0 }, bugsAdded: { verified: 1 } }), {
    send: true,
    kind: 'bugfix',
  });
  assert.deepEqual(decideNotify({ ok: true, openAdded: { total: 0 }, changed: true }), {
    send: true,
    kind: 'change',
  });
});

test('phiên hết hạn vẫn thắng mọi tin khác', () => {
  assert.deepEqual(
    decideNotify({ ok: false, err: 'invalid api key', openAdded: { total: 9, mine: 9 } }),
    { send: true, kind: 'auth' },
  );
});

test('một lượt radar phát hiện bug mới thì bắn thông báo nêu số bug của mình', () => {
  const root = tmp('radar-newbug-');
  const statePath = path.join(root, 'state.json');
  const write = (openBugs) =>
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        bugWatch: {
          s1: {
            follow: true,
            heat: 'hot',
            title: 'BugList CFL',
            openBugs: openBugs.map((b) => ({ status: 'chua-fix', ...b })),
            openBugsAt: at(0, 14, 45).toISOString(),
          },
        },
      }),
    );
  write([]);
  fs.utimesSync(statePath, 0, 0);

  const said = [];
  const row = runTick({
    root,
    now: at(0, 14, 45),
    runClaude: () => {
      write([
        { bugId: '4', bucket: 'mine' },
        { bugId: '5', bucket: 'unknown' },
      ]);
      return { ok: true, ms: 1 };
    },
    notify: (title, msg) => said.push(msg),
  });

  assert.equal(row.skipped, null);
  assert.equal(row.openAdded.total, 2);
  assert.equal(said.length, 1);
  assert.match(said[0], /BugList CFL/);
  assert.match(said[0], /2 chưa fix/);
});

// ---------- radar tự đóng dấu giờ poll: KHÔNG trông vào LLM như trường heat ----------

const pollRoot = (bugWatch) => {
  const root = tmp('radar-poll-');
  const statePath = path.join(root, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ bugWatch }));
  fs.utimesSync(statePath, 0, 0);
  return root;
};
const stamps = (root) => {
  const bw = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8')).bugWatch;
  return Object.fromEntries(Object.entries(bw).map(([k, e]) => [k, e.lastPollAt || null]));
};

test('sau lượt bugwatch, mọi sheet đang theo dõi được đóng dấu giờ poll', () => {
  const root = pollRoot({ s1: { follow: true, heat: 'warm' }, s2: { follow: true, heat: 'warm' } });
  runTick({ root, now: at(0, 14, 45), runClaude: () => ({ ok: true, ms: 1 }), notify: () => {} });
  assert.deepEqual(stamps(root), {
    s1: at(0, 14, 45).toISOString(),
    s2: at(0, 14, 45).toISOString(),
  });
});

test('sheet đã thôi theo dõi không bị đóng dấu — để bật lại là quét ngay', () => {
  const root = pollRoot({ s1: { follow: true, heat: 'warm' }, s2: { follow: false } });
  runTick({ root, now: at(0, 14, 45), runClaude: () => ({ ok: true, ms: 1 }), notify: () => {} });
  assert.equal(stamps(root).s2, null);
});

test('lượt bugwatch HỎNG vẫn đóng dấu — không thì mỗi lượt lại bắn lại, đốt tiền', () => {
  const root = pollRoot({ s1: { follow: true, heat: 'warm' } });
  runTick({
    root,
    now: at(0, 14, 45),
    runClaude: () => ({ ok: false, ms: 1, err: 'timeout' }),
    notify: () => {},
  });
  assert.equal(stamps(root).s1, at(0, 14, 45).toISOString());
});

test('lượt delta không đóng dấu — nó không hề đọc sheet', () => {
  const root = pollRoot({ s1: { follow: true, heat: 'warm' } });
  const row = runTick({ root, now: at(0, 14, 10), runClaude: () => ({ ok: true, ms: 1 }), notify: () => {} });
  assert.equal(row.prompt, '/daily delta');
  assert.equal(stamps(root).s1, null);
});

// ---------- thông báo phải nói RÕ: buglist nào, chưa fix bao nhiêu, chờ confirm bao nhiêu ----------

test('delta tách chưa-fix với chờ-confirm', () => {
  assert.deepEqual(
    openDelta({ total: 1, chuaFix: 1, choConfirm: 0 }, { total: 4, chuaFix: 2, choConfirm: 2 }),
    { total: 3, chuaFix: 1, choConfirm: 2, mine: 0, unknown: 0, notMine: 0 },
  );
});

const followRoot = (bugWatch) => {
  const root = tmp('radar-notify-');
  const statePath = path.join(root, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ bugWatch }));
  fs.utimesSync(statePath, 0, 0);
  return root;
};

test('thông báo nêu tên buglist + số chưa fix + số chờ confirm', () => {
  const stamp = at(0, 14, 45).toISOString();
  const root = followRoot({ s1: { follow: true, heat: 'hot', title: 'BugList CFL', openBugs: [], openBugsAt: stamp } });
  const said = [];
  runTick({
    root,
    now: at(0, 14, 45),
    runClaude: () => {
      fs.writeFileSync(
        path.join(root, 'state.json'),
        JSON.stringify({
          bugWatch: {
            s1: {
              follow: true,
              heat: 'hot',
              title: 'BugList CFL',
              openBugsAt: stamp,
              openBugs: [
                { bugId: '6', bucket: 'mine', status: 'chua-fix' },
                { bugId: '1', bucket: 'mine', status: 'cho-confirm' },
                { bugId: '5', bucket: 'unknown', status: 'cho-confirm' },
              ],
            },
          },
        }),
      );
      return { ok: true, ms: 1 };
    },
    notify: (t, m) => said.push(m),
  });
  assert.equal(said.length, 1);
  assert.match(said[0], /BugList CFL/);
  assert.match(said[0], /1 chưa fix/);
  assert.match(said[0], /2 đã sửa, chờ QC confirm/);
});

test('sheet KHÔNG theo dõi thì không được lọt vào thông báo', () => {
  const stamp = at(0, 14, 45).toISOString();
  const root = followRoot({
    on: { follow: true, heat: 'hot', title: 'Sheet BẬT', openBugs: [], openBugsAt: stamp },
    off: { follow: false, title: 'Sheet TẮT', openBugs: [{ bugId: '9', bucket: 'mine', status: 'chua-fix' }], openBugsAt: stamp },
  });
  const said = [];
  runTick({
    root,
    now: at(0, 14, 45),
    runClaude: () => {
      const s = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8'));
      s.bugWatch.on.openBugs = [{ bugId: '1', bucket: 'mine', status: 'chua-fix' }];
      fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify(s));
      return { ok: true, ms: 1 };
    },
    notify: (t, m) => said.push(m),
  });
  assert.match(said[0], /Sheet BẬT/);
  assert.doesNotMatch(said[0], /Sheet TẮT/);
});

test('thông báo ghi rõ số liệu đọc cách đây bao lâu', () => {
  const readAt = new Date(Number(at(0, 14, 45)) - 5.4e6).toISOString();
  const root = followRoot({
    s1: { follow: true, heat: 'hot', title: 'BugList CFL', openBugs: [], openBugsAt: readAt },
  });
  const said = [];
  runTick({
    root,
    now: at(0, 14, 45),
    runClaude: () => {
      const s = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8'));
      s.bugWatch.s1.openBugs = [{ bugId: '6', bucket: 'mine', status: 'chua-fix' }];
      fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify(s));
      return { ok: true, ms: 1 };
    },
    notify: (t, m) => said.push(m),
  });
  assert.match(said[0], /đọc 90 phút trước/);
});
