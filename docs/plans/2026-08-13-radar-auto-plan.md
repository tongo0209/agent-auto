# Radar nền tự chạy — kế hoạch triển khai

> **Cho người/agent thực thi:** làm theo từng Task, mỗi Task tự đứng được và tự có test.
> Spec: `docs/specs/2026-08-13-radar-auto-design.md`.

**Mục tiêu:** `/daily delta` tự chạy mỗi 60' trong 8h–18h T2–T6 qua launchd, không cần mở
console hay bấm nút, có sổ + cảnh báo + trạng thái nhìn được trên console.

**Kiến trúc:** launchd gọi `node tools/radar-tick.mjs`; script chặn 3 cổng (giờ / lock /
người đang gõ tay) rồi gọi `claude -p "/daily delta"` với whitelist tool; so số dòng
`history/issues.jsonl` + `phases.jsonl` trước-sau để biết có thay đổi thật; ghi
`history/radar.jsonl`; console đọc sổ đó qua `/api/radar`.

**Tech:** Node 25 ESM (`tools/*.mjs`), `node --test`, Express (console CJS), launchd plist,
osascript. **Node 25 hỗ trợ `require(ESM)`** (đã đo) nên console CJS `require` thẳng
`tools/radar-tick.mjs` — cổng giờ chỉ có MỘT bản, không nhân đôi logic.

## Ràng buộc chung

- **KHÔNG tự `git commit` / `git push`** — hết mỗi Task thì báo user, user quyết. (Luật global.)
- Không đẻ logic quét mới: radar chỉ gọi `/daily delta` sẵn có.
- Không sửa `history/issues.jsonl`, `history/phases.jsonl` (chỉ đọc để đếm).
- Mọi file mới phải qua `npm run check` trong `console/` (lint + test + test:tools + build + doctor).
- Tiếng Việt trong comment/UI, theo nếp repo. Comment giải thích **vì sao**, không mô tả lại code.
- Đường dẫn gốc: `/Users/lap17727/VNG/agent-auto` (viết tắt `<ROOT>` dưới đây).

---

### Task 1: Ba cổng chặn (hàm thuần + test)

**Files:**
- Tạo: `tools/radar-tick.mjs`
- Tạo: `tools/radar-tick.test.mjs`

**Interfaces — Produces:**
- `DEFAULTS` — object mặc định của `config.radar`
- `shouldRunNow(date, cfg) → { run: boolean, why: string|null }` (`why`: `disabled|off-day|off-hours|null`)
- `lockState(lockPath, nowMs, staleMs) → 'free'|'busy'|'stale'`
- `humanBusy(paths, nowMs, graceMs) → boolean`

- [ ] **Bước 1: Viết test trước**

```js
// tools/radar-tick.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shouldRunNow, lockState, humanBusy, DEFAULTS } from './radar-tick.mjs';

const at = (day, h, m = 0) => new Date(2026, 7, 10 + day, h, m); // 10/8/2026 là thứ Hai

test('cổng giờ: trong khung T2-T6 08:00-18:00 thì chạy', () => {
  assert.equal(shouldRunNow(at(0, 8, 0), DEFAULTS).run, true); // T2 08:00
  assert.equal(shouldRunNow(at(4, 18, 0), DEFAULTS).run, true); // T6 18:00 — mép phải vẫn chạy
});

test('cổng giờ: ngoài khung thì không chạy, và nói rõ vì sao', () => {
  assert.deepEqual(shouldRunNow(at(0, 7, 59), DEFAULTS), { run: false, why: 'off-hours' });
  assert.deepEqual(shouldRunNow(at(0, 18, 1), DEFAULTS), { run: false, why: 'off-hours' });
  assert.deepEqual(shouldRunNow(at(5, 10, 0), DEFAULTS), { run: false, why: 'off-day' }); // T7
  assert.deepEqual(shouldRunNow(at(6, 10, 0), DEFAULTS), { run: false, why: 'off-day' }); // CN
});

test('cổng giờ: công tắc tắt thì thắng mọi thứ', () => {
  assert.deepEqual(shouldRunNow(at(0, 10, 0), { ...DEFAULTS, enabled: false }), {
    run: false,
    why: 'disabled',
  });
});

test('cổng lock: không file = free, mới = busy, quá hạn = stale', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  const lock = path.join(d, 'radar.lock');
  const now = 1_000_000_000_000;
  assert.equal(lockState(lock, now, 60_000), 'free');
  fs.writeFileSync(lock, JSON.stringify({ pid: 1, atMs: now - 10_000 }));
  assert.equal(lockState(lock, now, 60_000), 'busy');
  fs.writeFileSync(lock, JSON.stringify({ pid: 1, atMs: now - 999_000 }));
  assert.equal(lockState(lock, now, 60_000), 'stale');
});

test('cổng lock: file hỏng coi như stale, không được kẹt vĩnh viễn', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  const lock = path.join(d, 'radar.lock');
  fs.writeFileSync(lock, 'không phải json');
  assert.equal(lockState(lock, Date.now(), 60_000), 'stale');
});

test('cổng người: file vừa đổi thì nhường, cũ thì thôi; file không có không tính là bận', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  const f = path.join(d, 'state.json');
  fs.writeFileSync(f, '{}');
  assert.equal(humanBusy([f], Date.now(), 3 * 60e3), true);
  assert.equal(humanBusy([f], Date.now() + 10 * 60e3, 3 * 60e3), false);
  assert.equal(humanBusy([path.join(d, 'không-có.json')], Date.now(), 3 * 60e3), false);
});
```

- [ ] **Bước 2: Chạy để thấy nó ĐỎ**

Chạy: `cd <ROOT> && node --test tools/radar-tick.test.mjs`
Kỳ vọng: FAIL — `Cannot find module .../radar-tick.mjs`

- [ ] **Bước 3: Viết đủ để xanh**

```js
#!/usr/bin/env node
/**
 * radar-tick — MỘT lượt radar nền: gọi `/daily delta` trong phiên headless (`claude -p`).
 *
 * Vì sao tồn tại: trước đây muốn radar chạy nền phải mở console → mở tab → bấm `claude` →
 * bấm `radar 30m`. Mỗi phiên làm việc phải click lại, và radar chết theo tab.
 *
 * Vì sao dám chạy nền — chỗ này từng bị cấm nhầm: ghi chú cũ trong SKILL.md nói phiên nền
 * không có token connector Jira. Đo thật 13/8: `claude -p` gọi được `searchJiraIssuesUsingJql`
 * (OK GW-720, 16.6s) và gọi được cả skill (`/daily status`, 47s). Giả định cũ SAI.
 *
 * Chạy: node tools/radar-tick.mjs [--force] [--dry]
 *   --force  bỏ qua cổng giờ (để nghiệm thu ngoài khung 8-18h)
 *   --dry    chạy hết các cổng nhưng KHÔNG gọi claude, không ghi sổ
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  enabled: true,
  days: [1, 2, 3, 4, 5], // 0=CN … 6=T7, theo Date.getDay()
  hours: [8, 18],
  graceMin: 3,
  lockStaleMin: 15,
  timeoutMin: 5,
};

/**
 * Cổng ①. Mép phải TÍNH THEO PHÚT chứ không theo giờ: `hours:[8,18]` nghĩa là chạy tới đúng
 * 18:00, 18:01 là nghỉ. So theo `getHours() <= 18` sẽ lỡ chạy tới 18:59.
 */
export function shouldRunNow(date, cfg = {}) {
  const c = { ...DEFAULTS, ...cfg };
  if (c.enabled === false) return { run: false, why: 'disabled' };
  if (!c.days.includes(date.getDay())) return { run: false, why: 'off-day' };
  const cur = date.getHours() * 60 + date.getMinutes();
  if (cur < c.hours[0] * 60 || cur > c.hours[1] * 60) return { run: false, why: 'off-hours' };
  return { run: true, why: null };
}

/**
 * Cổng ②. File lock hỏng/không đọc được → 'stale' chứ không 'busy': một lần ghi lỗi mà coi là
 * bận thì radar kẹt vĩnh viễn và im lặng — đúng kiểu hỏng khó thấy nhất.
 */
export function lockState(lockPath, nowMs = Date.now(), staleMs = DEFAULTS.lockStaleMin * 60e3) {
  let atMs;
  try {
    atMs = JSON.parse(fs.readFileSync(lockPath, 'utf8')).atMs;
  } catch (err) {
    return err.code === 'ENOENT' ? 'free' : 'stale';
  }
  if (!Number.isFinite(atMs)) return 'stale';
  return nowMs - atMs >= staleMs ? 'stale' : 'busy';
}

/** Cổng ③. File không tồn tại KHÔNG phải "bận" — board hôm nay có thể chưa được tạo. */
export function humanBusy(paths, nowMs = Date.now(), graceMs = DEFAULTS.graceMin * 60e3) {
  return paths.some((p) => {
    try {
      return nowMs - fs.statSync(p).mtimeMs < graceMs;
    } catch {
      return false;
    }
  });
}
```

- [ ] **Bước 4: Chạy lại cho XANH**

Chạy: `cd <ROOT> && node --test tools/radar-tick.test.mjs`
Kỳ vọng: PASS toàn bộ 6 test.

- [ ] **Bước 5: Báo user** — chưa commit (luật global). Nêu: 6 test xanh, file mới `tools/radar-tick.mjs`.

---

### Task 2: Đo thay đổi + quyết định báo (hàm thuần + test)

**Files:**
- Sửa: `tools/radar-tick.mjs` (thêm hàm, giữ nguyên phần Task 1)
- Sửa: `tools/radar-tick.test.mjs` (thêm test)

**Interfaces — Consumes:** `DEFAULTS` (Task 1). **Produces:**
- `countLines(filePath) → number`
- `diffCounts(before, after) → { changed: boolean, newRows: object }`
- `failStreak(rows) → number` (bỏ qua dòng `skipped`)
- `decideNotify({ ok, err, changed, streak }) → { send: boolean, kind: 'auth'|'dead'|'change'|null }`

- [ ] **Bước 1: Viết test trước**

```js
// thêm vào tools/radar-tick.test.mjs
import { countLines, diffCounts, failStreak, decideNotify } from './radar-tick.mjs';

test('đếm dòng jsonl: file không có = 0, dòng trống không tính', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-'));
  const f = path.join(d, 'a.jsonl');
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
```

- [ ] **Bước 2: Chạy để thấy ĐỎ**

Chạy: `cd <ROOT> && node --test tools/radar-tick.test.mjs`
Kỳ vọng: FAIL — `countLines is not a function`

- [ ] **Bước 3: Viết đủ để xanh**

```js
// thêm vào tools/radar-tick.mjs
/** Đếm dòng thật của .jsonl (dòng trống không tính) — dùng để so trước/sau 1 lượt delta */
export function countLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * "Có thay đổi thật không" = có dòng MỚI trong sổ nhật ký, chứ không hỏi lại LLM.
 * Chỉ đếm phần TĂNG: file bị dọn bớt không được tính thành thay đổi.
 */
export function diffCounts(before, after) {
  const newRows = {};
  for (const k of Object.keys(after)) {
    const d = (after[k] ?? 0) - (before[k] ?? 0);
    if (d > 0) newRows[k] = d;
  }
  return { changed: Object.keys(newRows).length > 0, newRows };
}

/** Đếm ngược số lượt hỏng liên tiếp gần nhất. Lượt bị bỏ (skipped) không phải hỏng, bỏ qua. */
export function failStreak(rows = []) {
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].skipped) continue;
    if (rows[i].ok) break;
    n++;
  }
  return n;
}

/**
 * Hết hạn đăng nhập là ca NGUY HIỂM NHẤT nên báo ngay: radar vẫn chạy đều, vẫn ghi sổ, chỉ có
 * điều lượt nào cũng "không có gì mới" — im lặng đúng kiểu làm user tin nhầm là mọi thứ yên.
 * Các lỗi khác (timeout, mạng) thì đợi 3 lượt (~1h30) mới báo để khỏi spam.
 */
const AUTH_ERR = /invalid api key|\/login|unauthor|authenticat|credential|token.*expir/i;

export function decideNotify({ ok, err = '', changed = false, streak = 0 }) {
  if (!ok && AUTH_ERR.test(err)) return { send: true, kind: 'auth' };
  if (!ok) return streak >= 3 ? { send: true, kind: 'dead' } : { send: false, kind: null };
  return changed ? { send: true, kind: 'change' } : { send: false, kind: null };
}
```

- [ ] **Bước 4: Chạy lại cho XANH**

Chạy: `cd <ROOT> && node --test tools/radar-tick.test.mjs`
Kỳ vọng: PASS 12 test.

- [ ] **Bước 5: Báo user.**

---

### Task 3: Thân lượt chạy — gọi claude, ghi sổ, bắn notification

**Files:**
- Sửa: `tools/radar-tick.mjs` (thêm `ALLOWED_TOOLS`, `buildArgs`, `runTick`, khối `main`)
- Sửa: `tools/radar-tick.test.mjs` (test `buildArgs` + `runTick` với claude giả)
- Sửa: `config.json` (thêm khoá `radar`)

**Interfaces — Consumes:** toàn bộ Task 1+2. **Produces:**
- `ALLOWED_TOOLS: string` · `buildArgs(prompt) → string[]`
- `runTick({ root, now, argv, runClaude, notify }) → object` (chính là dòng sẽ ghi vào sổ)

- [ ] **Bước 1: Viết test trước** — `runClaude`/`notify` tiêm vào được nên không cần gọi claude thật

```js
// thêm vào tools/radar-tick.test.mjs
import { buildArgs, runTick, ALLOWED_TOOLS } from './radar-tick.mjs';

function root(cfg = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-root-'));
  fs.mkdirSync(path.join(d, 'history'), { recursive: true });
  fs.mkdirSync(path.join(d, 'boards'), { recursive: true });
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify({ radar: { ...DEFAULTS, ...cfg } }));
  fs.writeFileSync(path.join(d, 'state.json'), '{}');
  fs.utimesSync(path.join(d, 'state.json'), new Date(0), new Date(0)); // giả vờ cũ, khỏi vướng cổng ③
  return d;
}
const monday = new Date(2026, 7, 10, 10, 0);

test('whitelist phải có Skill — thiếu là không nạp được /daily, tick chết câm', () => {
  assert.match(ALLOWED_TOOLS, /(^|,)Skill(,|$)/);
  assert.deepEqual(buildArgs('/daily delta').slice(0, 2), ['-p', '/daily delta']);
  assert.ok(buildArgs('/daily delta').includes('--output-format'));
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
  assert.equal(fs.existsSync(path.join(d, '.locks/radar.lock')), false); // lock phải được nhả
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
```

- [ ] **Bước 2: Chạy để thấy ĐỎ**

Chạy: `cd <ROOT> && node --test tools/radar-tick.test.mjs`
Kỳ vọng: FAIL — `runTick is not a function`

- [ ] **Bước 3: Viết đủ để xanh**

```js
// thêm vào tools/radar-tick.mjs — dòng import này đặt CẠNH 2 import sẵn có ở đầu file
import { execFileSync } from 'node:child_process';

/**
 * Phiên nền không có ai bấm "Allow" — tool nằm ngoài danh sách này làm tick chết CÂM.
 * Vì vậy thà liệt kê tường minh rồi nới theo sổ, còn hơn mở toang bằng skip-permissions.
 * `Skill` là tool nạp `/daily`: thiếu nó thì prompt chạy như văn bản thường, không ra radar.
 */
export const ALLOWED_TOOLS = [
  'Skill',
  'Read',
  'Write',
  'Edit',
  'ToolSearch',
  'Glob',
  'Grep',
  'Bash(git:*)',
  'Bash(node:*)',
  'Bash(cp:*)',
  'Bash(mkdir:*)',
  'Bash(ls:*)',
  'Bash(cat:*)',
  'Bash(date:*)',
  'mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql',
  'mcp__claude_ai_Atlassian__getJiraIssue',
  'mcp__claude_ai_Atlassian__getAccessibleAtlassianResources',
].join(',');

export function buildArgs(prompt = '/daily delta') {
  return ['-p', prompt, '--allowedTools', ALLOWED_TOOLS, '--output-format', 'json'];
}

const readJSON = (p, fb) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fb;
  }
};
const todayStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Gọi claude thật — tách riêng để test tiêm bản giả vào, không phải đốt token mỗi lần chạy test */
function realClaude(root, timeoutMs) {
  const t0 = Date.now();
  try {
    const out = execFileSync('claude', buildArgs(), {
      cwd: root,
      timeout: timeoutMs,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const j = JSON.parse(out);
    return {
      ok: !j.is_error,
      ms: j.duration_ms ?? Date.now() - t0,
      costUsd: j.total_cost_usd ?? null,
      err: j.is_error ? String(j.result || '').slice(0, 500) : null,
    };
  } catch (err) {
    // stdout của claude vẫn đáng giá khi nó exit ≠ 0 (chứa lý do thật, vd hết hạn đăng nhập)
    const detail = String(err.stdout || '') + ' ' + err.message;
    return { ok: false, ms: Date.now() - t0, costUsd: null, err: detail.trim().slice(0, 500) };
  }
}

function osaNotify(title, message) {
  try {
    execFileSync('osascript', [
      '-e',
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
    ]);
  } catch {
    // Báo là best-effort tuyệt đối: chưa cấp quyền Notifications không được làm hỏng lượt quét.
  }
}

const MSG = {
  change: (r) =>
    'Có thay đổi mới: ' +
    Object.entries(r.newRows)
      .map(([k, v]) => `${v} dòng ${k}`)
      .join(' · '),
  auth: () => 'Phiên Claude hết hạn — radar đang quét ra trắng. Chạy /login.',
  dead: (r) => `Radar hỏng ${r.streak} lượt liên tiếp: ${String(r.err).slice(0, 120)}`,
};

/**
 * MỘT lượt. Trả về đúng dòng sẽ ghi vào sổ (test đọc trực tiếp trả về, không phải parse file).
 * `runClaude`/`notify` tiêm được để test không gọi ra ngoài.
 */
export function runTick({ root, now = new Date(), argv = [], runClaude, notify = osaNotify } = {}) {
  const cfg = { ...DEFAULTS, ...(readJSON(path.join(root, 'config.json'), {}).radar || {}) };
  const sock = path.join(root, 'history', 'radar.jsonl');
  const lock = path.join(root, '.locks', 'radar.lock');
  const stamp = () => new Date(now).toISOString();
  const write = (row) => {
    fs.mkdirSync(path.dirname(sock), { recursive: true });
    fs.appendFileSync(sock, JSON.stringify(row) + '\n');
    return row;
  };

  // ① Ngoài khung giờ thì im lặng TUYỆT ĐỐI — ghi sổ ở đây là 300 dòng rác mỗi ngày, làm
  // loãng đúng cái sổ mình dựng lên để soi lúc có sự cố.
  const gate = shouldRunNow(now, cfg);
  if (!gate.run && !argv.includes('--force')) return { at: stamp(), skipped: gate.why };

  // ② + ③ có ghi sổ: bỏ lượt là chuyện đáng truy ngược khi user hỏi "sao 2 tiếng không quét?"
  const st = lockState(lock, Number(now), cfg.lockStaleMin * 60e3);
  if (st === 'busy') return write({ at: stamp(), skipped: 'locked' });

  const watched = [path.join(root, 'state.json'), path.join(root, 'boards', todayStr(now) + '.md')];
  if (humanBusy(watched, Date.now(), cfg.graceMin * 60e3)) return write({ at: stamp(), skipped: 'human' });

  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, atMs: Number(now) }));
  try {
    const files = { issues: path.join(root, 'history/issues.jsonl'), phases: path.join(root, 'history/phases.jsonl') };
    const snap = () => Object.fromEntries(Object.entries(files).map(([k, p]) => [k, countLines(p)]));
    const before = snap();
    if (argv.includes('--dry')) return { at: stamp(), skipped: 'dry' };

    const res = (runClaude || (() => realClaude(root, cfg.timeoutMin * 60e3)))();
    const { changed, newRows } = diffCounts(before, snap());
    if (!fs.existsSync(sock)) fs.writeFileSync(sock, ''); // lượt đầu tiên: chưa có sổ để đọc
    const rows = fs
      .readFileSync(sock, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const row = write({ at: stamp(), ok: res.ok, skipped: null, ms: res.ms, changed, newRows, costUsd: res.costUsd, err: res.err });
    const streak = failStreak([...rows, row]);
    const { send, kind } = decideNotify({ ok: res.ok, err: res.err || '', changed, streak });
    if (send) notify('Radar — agent-auto', MSG[kind]({ ...row, streak }));
    return row;
  } catch (err) {
    return write({ at: stamp(), ok: false, skipped: null, changed: false, newRows: {}, err: String(err.message).slice(0, 500) });
  } finally {
    // Nhả lock kể cả khi nổ giữa chừng — không thì 15' sau mới có lượt kế tiếp.
    try {
      fs.unlinkSync(lock);
    } catch {
      // lock đã bị dọn tay hoặc chưa kịp tạo — không phải lỗi
    }
  }
}

// Chỉ chạy khi gọi thẳng từ CLI (import trong test thì không được tự bắn 1 lượt thật)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const row = runTick({ root: path.resolve(import.meta.dirname, '..'), argv: process.argv.slice(2) });
  console.log(JSON.stringify(row));
}
```

- [ ] **Bước 4: Chạy lại cho XANH**

Chạy: `cd <ROOT> && node --test tools/radar-tick.test.mjs`
Kỳ vọng: PASS 17 test.

- [ ] **Bước 5: Thêm khoá `radar` vào `config.json`** (giữ nguyên mọi khoá cũ, chỉ thêm)

```json
  "radar": { "enabled": true, "days": [1,2,3,4,5], "hours": [8,18],
             "graceMin": 3, "lockStaleMin": 15, "timeoutMin": 5 }
```

- [ ] **Bước 6: Thêm `.locks/` vào `.gitignore`** — 1 dòng `.locks/`

- [ ] **Bước 7: Doctor không được đỏ vì khoá mới**

Chạy: `cd <ROOT>/console && npm run doctor`
Kỳ vọng: exit 0, không có ERROR nào nhắc `radar`. Nếu doctor kêu khoá lạ → thêm `radar` vào
chỗ liệt kê khoá config hợp lệ trong `tools/state-doctor.mjs`, rồi chạy lại cho sạch.

- [ ] **Bước 8: Báo user.**

---

### Task 4: Đồng hồ launchd + nghiệm thu chạy thật

**Files:**
- Tạo: `tools/radar-agent.plist` (bản mẫu trong repo, để còn đọc lại được)
- Tạo: `tools/radar-install.sh` (chép plist về `~/Library/LaunchAgents/` + bootstrap + in trạng thái)

**Interfaces — Consumes:** `tools/radar-tick.mjs` (Task 3).

- [ ] **Bước 1: Viết plist**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.tont.agent-auto.radar</string>
  <!-- zsh -lc để có PATH/SSH của phiên đăng nhập: `claude` và key gitlab nội bộ đều cần.
       Chạy node thẳng bằng đường dẫn tuyệt đối thì mất env, git pull sẽ hỏng. -->
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd /Users/lap17727/VNG/agent-auto &amp;&amp; exec node tools/radar-tick.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/lap17727/VNG/agent-auto</string>
  <!-- 60' một nhịp. Khung 8-18h T2-T6 do script tự chặn (test được), không nhét 110 dòng
       StartCalendarInterval vào đây. -->
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>/Users/lap17727/VNG/agent-auto/history/radar-stdout.log</string>
  <key>StandardErrorPath</key><string>/Users/lap17727/VNG/agent-auto/history/radar-stderr.log</string>
</dict>
</plist>
```

- [ ] **Bước 2: Viết script cài**

```bash
#!/bin/zsh
# Cài/gỡ radar nền. Dùng: tools/radar-install.sh [install|uninstall|status|kick]
set -e
LABEL=com.tont.agent-auto.radar
SRC="$(cd "$(dirname "$0")" && pwd)/radar-agent.plist"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

case "${1:-install}" in
  install)
    cp "$SRC" "$DEST"
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$DEST"
    echo "đã cài — $(launchctl print "$DOMAIN/$LABEL" | grep -E 'state|program' | head -3)" ;;
  uninstall) launchctl bootout "$DOMAIN/$LABEL" && rm -f "$DEST" && echo "đã gỡ" ;;
  kick)      launchctl kickstart -k "$DOMAIN/$LABEL" && echo "đã đá 1 nhịp" ;;
  status)    launchctl print "$DOMAIN/$LABEL" | grep -E 'state|last exit|runs' ;;
esac
```

Rồi `chmod +x tools/radar-install.sh`.

- [ ] **Bước 3: Nghiệm thu — 1 tick tay, có thật**

Chạy: `cd <ROOT> && node tools/radar-tick.mjs --force`
Kỳ vọng: in ra 1 dòng JSON có `"ok":true`; `tail -1 history/radar.jsonl` thấy đúng dòng đó;
`git -C <ROOT> status --short state.json` cho thấy state có/không đổi tuỳ Jira thật.
**Nếu `ok:false`:** đọc `err` — thiếu quyền tool thì bổ sung đúng tool đó vào `ALLOWED_TOOLS`
rồi chạy lại. Không được đi tiếp khi còn `ok:false`.

- [ ] **Bước 4: Nghiệm thu — cổng giờ chặn thật**

Chạy: `cd <ROOT> && node -e "import('./tools/radar-tick.mjs').then(m=>console.log(m.runTick({root:process.cwd(),now:new Date(2026,7,8,10,0)})))"`
Kỳ vọng: in `{ at: …, skipped: 'off-day' }`, và `history/radar.jsonl` **không** dài thêm.

- [ ] **Bước 5: Cài rồi đá 1 nhịp qua launchd**

Chạy: `cd <ROOT> && tools/radar-install.sh install && tools/radar-install.sh kick`
Đợi ~90s rồi: `tail -2 history/radar.jsonl; cat history/radar-stderr.log`
Kỳ vọng: có dòng mới do launchd sinh (không phải dòng bước 3), stderr rỗng.
**Đây là bước chứng minh rủi ro SSH/env đã hết** — nếu `err` nhắc `git`/`Permission denied
(publickey)` thì ghi nhận đúng như spec mục 10.1 và báo user, radar vẫn chạy tiếp phần Jira.

- [ ] **Bước 6: Báo user** kèm output thật của bước 3 và bước 5.

---

### Task 5: `/api/radar` cho console

**Files:**
- Tạo: `console/server/lib/radar.js`
- Tạo: `console/server/lib/radar.test.mjs`
- Tạo: `console/server/routes/radar.js`
- Sửa: `console/server/lib/paths.js` (thêm `file.radar`)
- Sửa: `console/server/index.js` (đăng ký route)

**Interfaces — Consumes:** `shouldRunNow` từ `tools/radar-tick.mjs` (Node 25 cho phép CJS
`require` file ESM — đã đo). **Produces:** `radarStatus({ rows, cfg, now }) → { level, enabled,
inWindow, last, lastChangedAt, failStreak }`, `level ∈ 'off'|'off-hours'|'ok'|'dead'`.

- [ ] **Bước 1: Viết test trước**

```js
// console/server/lib/radar.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const { radarStatus } = createRequire(import.meta.url)('./radar.js');

const CFG = { enabled: true, days: [1, 2, 3, 4, 5], hours: [8, 18] };
const monday = new Date(2026, 7, 10, 14, 0);
const iso = (d) => new Date(d).toISOString();

test('tắt công tắc thì báo tắt, không báo hỏng', () => {
  const s = radarStatus({ rows: [], cfg: { ...CFG, enabled: false }, now: monday });
  assert.equal(s.level, 'off');
});

test('ngoài giờ thì im là ĐÚNG — không được vẽ đỏ suốt đêm và cuối tuần', () => {
  const s = radarStatus({ rows: [], cfg: CFG, now: new Date(2026, 7, 8, 22, 0) });
  assert.equal(s.level, 'off-hours');
});

test('trong giờ mà lượt cuối quá 90 phút = chết', () => {
  const rows = [{ at: iso(monday.getTime() - 100 * 60e3), ok: true }];
  assert.equal(radarStatus({ rows, cfg: CFG, now: monday }).level, 'dead');
});

test('trong giờ, lượt cuối vừa xong = ok, và nhớ mốc thay đổi gần nhất', () => {
  const rows = [
    { at: iso(monday.getTime() - 60 * 60e3), ok: true, changed: true },
    { at: iso(monday.getTime() - 5 * 60e3), ok: true, changed: false },
  ];
  const s = radarStatus({ rows, cfg: CFG, now: monday });
  assert.equal(s.level, 'ok');
  assert.equal(s.lastChangedAt, rows[0].at);
});

test('3 lượt hỏng liên tiếp = chết dù vừa chạy xong', () => {
  const rows = [1, 2, 3].map((i) => ({ at: iso(monday.getTime() - i * 60e3), ok: false }));
  assert.equal(radarStatus({ rows, cfg: CFG, now: monday }).level, 'dead');
});
```

- [ ] **Bước 2: Chạy để thấy ĐỎ**

Chạy: `cd <ROOT>/console && node --test server/lib/radar.test.mjs`
Kỳ vọng: FAIL — không tìm thấy `./radar.js`

- [ ] **Bước 3: Viết `console/server/lib/radar.js`**

```js
const path = require('path');
const { AGENT_AUTO } = require('./paths');

/**
 * Cổng giờ lấy THẲNG từ tools/radar-tick.mjs — Node 25 cho phép require file ESM. Chép lại
 * luật giờ sang đây là mở đường cho hai bản lệch nhau: console vẽ "ngoài giờ" trong khi radar
 * vẫn đang chạy, hoặc ngược lại.
 */
const { shouldRunNow, failStreak } = require(path.join(AGENT_AUTO, 'tools', 'radar-tick.mjs'));

const DEAD_MS = 90 * 60e3;

/** Trạng thái để console vẽ 1 dòng. Thuần — không đọc file, test bơm `rows` vào thẳng. */
function radarStatus({ rows = [], cfg = {}, now = new Date() }) {
  const ticks = rows.filter((r) => !r.skipped);
  const last = ticks[ticks.length - 1] || null;
  const lastChangedAt = [...ticks].reverse().find((r) => r.changed)?.at || null;
  const streak = failStreak(rows);
  const gate = shouldRunNow(now, cfg);

  // Thứ tự quyết định QUAN TRỌNG: tắt/ngoài giờ phải chặn trước "chết", nếu không dòng này
  // đỏ suốt đêm và cả cuối tuần — lúc đó radar im là đúng thiết kế, báo đỏ là báo sai.
  let level = 'ok';
  if (gate.why === 'disabled') level = 'off';
  else if (!gate.run) level = 'off-hours';
  else if (streak >= 3) level = 'dead';
  else if (!last || Number(now) - Date.parse(last.at) > DEAD_MS) level = 'dead';

  return { level, enabled: cfg.enabled !== false, inWindow: gate.run, last, lastChangedAt, failStreak: streak };
}

module.exports = { radarStatus, DEAD_MS };
```

- [ ] **Bước 4: Chạy lại cho XANH**

Chạy: `cd <ROOT>/console && node --test server/lib/radar.test.mjs` → PASS 5 test.

- [ ] **Bước 5: Thêm `file.radar` vào `console/server/lib/paths.js`**

Trong object `file`, ngay dưới dòng `notified:`:

```js
    /** Sổ radar nền: 1 dòng mỗi lượt tick (tools/radar-tick.mjs ghi, console chỉ đọc) */
    radar: path.join(AGENT_AUTO, 'history', 'radar.jsonl'),
```

- [ ] **Bước 6: Viết `console/server/routes/radar.js`**

```js
const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSON, readJSONL } = require('../lib/fsutil');
const { snapshot, writeAtomic } = require('../lib/backup');
const { radarStatus } = require('../lib/radar');

const router = Router();

/** GET /api/radar — trạng thái radar nền, đọc history/radar.jsonl (CHỈ ĐỌC) */
router.get('/radar', (_req, res) => {
  const cfg = readJSON(file.config, {}).radar || {};
  res.json(radarStatus({ rows: readJSONL(file.radar), cfg, now: new Date() }));
});

/**
 * POST /api/radar/toggle — bật/tắt bằng config.radar.enabled, KHÔNG đụng launchctl: tick vẫn
 * nổ đúng nhịp rồi thoát ngay ở cổng ①. Đổi 1 khoá JSON thì hoàn tác được, còn bootout/bootstrap
 * từ server web thì lỗi là user mất radar mà không biết vì sao.
 */
router.post('/radar/toggle', (req, res) => {
  const cfg = readJSON(file.config, null);
  if (!cfg) return res.status(500).json({ error: 'không đọc được config.json' });
  cfg.radar = { ...(cfg.radar || {}), enabled: Boolean(req.body?.enabled) };
  snapshot(file.config, 'config'); // luật của repo: backup trước MỌI lần console ghi
  writeAtomic(file.config, JSON.stringify(cfg, null, 2) + '\n');
  res.json({ enabled: cfg.radar.enabled });
});

module.exports = router;
```

- [ ] **Bước 7: Đăng ký route** trong `console/server/index.js`, ngay dưới dòng `app.use('/api', require('./routes/delta'));`

```js
// Radar nền (launchd → tools/radar-tick.mjs): đọc sổ + công tắc bật/tắt
app.use('/api', require('./routes/radar'));
```

- [ ] **Bước 8: Nghiệm thu route thật**

Chạy: `cd <ROOT>/console && (node server/index.js &) && sleep 3 && curl -s localhost:4747/api/radar`
Kỳ vọng: JSON có `level`, `last`, `failStreak`. Xong nhớ tắt server vừa bật.

- [ ] **Bước 9: Báo user.**

---

### Task 6: Dòng trạng thái radar trên console

**Files:**
- Sửa: `console/src/core/api.js` (2 hàm)
- Sửa: `console/src/index.html` (1 thẻ)
- Sửa: `console/src/panels/todayPanel.js` (vẽ + poll)
- Sửa: `console/src/core/constants.mjs` (nút `radar 30m` → chạy 1 lượt tay)

**Interfaces — Consumes:** `GET /api/radar`, `POST /api/radar/toggle` (Task 5).

- [ ] **Bước 1: Thêm 2 hàm vào `console/src/core/api.js`** (trong object `api`, cạnh `alerts`)

```js
  // Radar nền (hệ launchd) — trạng thái + công tắc
  radar: () => getJSON('/api/radar'),
  radarToggle: (enabled) => postJSON('/api/radar/toggle', { enabled }),
```

- [ ] **Bước 2: Thêm chỗ vẽ vào `console/src/index.html`**, ngay dưới `<div id="delta-bar"></div>`

```html
    <div id="radar-bar"></div>
```

- [ ] **Bước 3: Vẽ trong `console/src/panels/todayPanel.js`** — thêm hàm cạnh `loadDelta`

```js
const RADAR_TEXT = {
  off: () => 'Radar · tắt',
  'off-hours': () => 'Radar · ngoài giờ (08–18, T2–T6)',
  ok: (s) => `Radar ${hhmm(s.last?.at)} · OK · ${s.last?.changed ? 'có thay đổi' : '0 thay đổi'}`,
  dead: (s) => `Radar · KHÔNG chạy${s.last ? ' từ ' + hhmm(s.last.at) : ''}`,
};
const hhmm = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

/**
 * Vì sao dòng này tồn tại: không có nó thì "im vì yên" và "im vì chết" trông GIỐNG HỆT nhau.
 * Đúng cái bẫy đã trả giá 6/8 với months.json — console vẽ số cũ, user mất tin vào console.
 */
async function loadRadar() {
  let s;
  try {
    s = await api.radar();
  } catch {
    return; // server tắt — giữ nguyên UI cũ, không được ném lỗi ra ngoài
  }
  $('#radar-bar').html(
    `<div class="radarbar ${s.level}">${icon('radar')}<span>${escapeHtml(RADAR_TEXT[s.level](s))}</span>
       <button type="button" class="btn ghost small" data-radar-toggle="${s.enabled ? 0 : 1}">${s.enabled ? 'tắt' : 'bật'}</button>
     </div>`
  );
}
```

- [ ] **Bước 4: Nối vào vòng poll + bind nút** — trong `initTodayPanel`, cạnh chỗ bind `#tasks`

```js
  $('#radar-bar').on('click', '[data-radar-toggle]', async function () {
    await api.radarToggle(Boolean(Number($(this).data('radar-toggle'))));
    loadRadar();
  });
```

Và gọi `loadRadar()` ở đúng chỗ đang gọi `loadDelta()` (cùng nhịp poll — cùng tab, cùng dữ liệu).

- [ ] **Bước 5: CSS** — thêm vào file style của tab Hôm nay, cạnh `.deltabar`

```css
.radarbar { display: flex; align-items: center; gap: 6px; font-size: 12px; opacity: .8; }
.radarbar.dead { color: var(--crit, #d33); opacity: 1; font-weight: 600; }
.radarbar.off, .radarbar.off-hours { opacity: .55; }
```

- [ ] **Bước 6: Đổi nút trong `console/src/core/constants.mjs`** — thay nguyên mục `radar 30m`

```js
  {
    // Radar nền 60' do launchd chạy (tools/radar-tick.mjs) — nút này chỉ để quét TAY 1 lượt
    // ngay lập tức. Ghi chú cũ ở đây nói cron không có token connector: ĐÃ ĐO LẠI 13/8 và sai
    // (claude -p gọi được cả Jira lẫn skill) — xem docs/specs/2026-08-13-radar-auto-design.md.
    cmd: '/daily delta',
    label: 'quét ngay',
    icon: 'radar',
    title: 'Quét 1 lượt ngay trong tab này (radar nền 30\' do launchd lo)',
  },
```

- [ ] **Bước 7: Build + lint + test toàn bộ**

Chạy: `cd <ROOT>/console && npm run check`
Kỳ vọng: EXIT 0 — lint sạch, test server + src xanh, `test:tools` xanh, webpack build xong, doctor sạch.

- [ ] **Bước 8: Nghiệm thu bằng mắt** — mở console, tab "Hôm nay": thấy dòng radar; bấm `tắt`
→ dòng đổi thành *"Radar · tắt"* và `config.json` có `radar.enabled: false`; bấm `bật` để trả lại.

- [ ] **Bước 9: Báo user.**

---

### Task 7: Sửa 3 ghi chú sai + ghi bài học

Ghi chú cũ cấm cron dựa trên giả định chưa từng đo. Để nguyên thì lần sau chính mình (hoặc
agent khác) đọc rồi lại tự cấm — đó là lý do Task này bắt buộc, không phải dọn dẹp cho đẹp.

**Files:**
- Sửa: `~/.claude/skills/daily/SKILL.md:93`
- Sửa: `console/src/index.js:141-144` (comment nút "Cập nhật")
- Sửa: `console/README.md` (mục radar nếu có)
- Sửa: `knowledge/lessons.md`

- [ ] **Bước 1: `SKILL.md`** — thay đoạn "**Chạy nền = `/loop 30m /daily delta`… KHÔNG dùng cron hệ thống…**"

```markdown
  **Chạy nền = launchd** (`tools/radar-tick.mjs`, mỗi 60' trong 08–18h T2–T6): không cần mở
  console/tab nào. Bật/tắt bằng `config.radar.enabled` hoặc nút trên console; sổ ở
  `history/radar.jsonl`. Chạy tay 1 lượt: `node tools/radar-tick.mjs --force`.
  ⚠ Ghi chú cũ ở đây từng cấm cron vì tưởng phiên nền mất token connector Jira. **Đo lại 13/8:
  sai** — `claude -p` gọi được `searchJiraIssuesUsingJql` (OK GW-720, 16.6s) và gọi được cả
  skill (`/daily status`, 47s). Thiết kế: `docs/specs/2026-08-13-radar-auto-design.md`.
```

- [ ] **Bước 2: `console/src/index.js`** — thay nguyên khối comment của nút "Cập nhật"

```js
  /**
   * Nút "Cập nhật": thay cho việc tự gõ /daily.
   * Vẽ lại từ đĩa là việc của poll (3s). Dữ liệu MỚI (Jira, gt-promotion) đến từ 2 đường:
   * radar nền 60' (launchd → tools/radar-tick.mjs) và nút này — gõ hộ /daily delta vào
   * terminal để quét ngay, không phải đợi hết nhịp.
   */

- [ ] **Bước 3: `knowledge/lessons.md`** — thêm mục mới

```markdown
## Giả định chưa đo mà thành luật cấm (13/8)

`SKILL.md` (daily) và `constants.mjs` cùng cấm chạy radar bằng cron với lý do "connector
Jira/SharePoint auth theo phiên tương tác nên phiên nền không có token". Không ai đo. Hệ quả:
suốt nhiều tuần radar chỉ chạy được khi user mở console → mở tab → bấm 2 nút, và chết theo tab.

Đo mất 2 lệnh, 64 giây: `claude -p` gọi được Jira (OK GW-720) và gọi được cả skill
(`/daily status`). Giả định sai từ đầu.

**Luật rút ra:** một câu cấm nằm trong skill có sức nặng như luật — trước khi viết "KHÔNG được
X", phải kèm bằng chứng đã đo X, hoặc ghi rõ "chưa đo, nghi ngờ". Ghi chú cấm mà không có bằng
chứng thì lần sau chính mình đọc lại và tin, không ai kiểm.
```

- [ ] **Bước 4: Kiểm không còn chỗ nào cấm nhầm**

Chạy: `cd <ROOT> && grep -rn "cron hệ thống\|không có token\|auth theo phiên" --include="*.js" --include="*.mjs" --include="*.md" . ~/.claude/skills/daily | grep -v node_modules`
Kỳ vọng: chỉ còn các dòng ĐÃ được viết lại kèm bằng chứng (spec, lessons, SKILL.md mới).

- [ ] **Bước 5: Báo user.**

---

### Task 8: Nghiệm thu trọn hệ và bàn giao

- [ ] **Bước 1: `npm run check`**

Chạy: `cd <ROOT>/console && npm run check` → EXIT 0.

- [ ] **Bước 2: Đợi 1 nhịp launchd THẬT** (không được thay bằng `kickstart`)

Chạy sau ≥60': `cd <ROOT> && tools/radar-install.sh status && tail -3 history/radar.jsonl`
Kỳ vọng: `runs` tăng, sổ có dòng mới với `at` khớp nhịp 60'.

- [ ] **Bước 3: Thử ca hỏng có thật** — tắt Wi-Fi ~1 phút rồi `node tools/radar-tick.mjs --force`
Kỳ vọng: sổ ghi `ok:false` + `err` có nội dung; **không** có notification (mới hỏng 1 lượt).

- [ ] **Bước 4: Trả lại trạng thái sạch** — bật lại mạng, `radar.enabled: true`, chạy 1 lượt cho xanh.

- [ ] **Bước 5: Báo user tổng kết** — kèm: số test xanh, output `radar.jsonl` thật, trạng thái
launchd, và **hỏi user có commit không** (luật global: không bao giờ tự commit).
