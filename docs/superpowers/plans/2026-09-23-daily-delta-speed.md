# /daily delta speed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cắt thời gian `/daily delta` (trung vị 255s) bằng script làm sẵn phần cơ học + nút effort, có cổng đủ bước chặn việc hạ effort làm rơi bước.

**Architecture:** `tools/delta-scan.mjs` (hàm thuần + 1 hàm git, CLI in JSON) — model chỉ còn phần Jira/Drive/ghi. `radar-tick` thêm `stepCheck` sau lượt delta và cờ `--effort`. SKILL `daily` mode `delta` gọi script ở bước đầu.

**Tech Stack:** Node ≥ 20 ESM, `node:test`, git CLI.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-23-daily-delta-speed-design.md`.
- Không bọc git trong `timeout` shell; dùng `timeout` của `execFileSync` (60s).
- Giờ commit in bằng `--date=format-local:%Y-%m-%d %H:%M`, CẤM `--date=format:`.
- `delta-scan` KHÔNG ghi `state.json`/board.
- `radar.effort` trống = hành vi cũ (không truyền `--effort`).
- Code theo `rules/code-style.md` R-CS-1..7. Commit `[tools]`/`[skills]`, không push.

---

### Task 1: `delta-scan` phần thuần

**Files:** Create `tools/delta-scan.mjs`, `tools/delta-scan.test.mjs`.

**Interfaces — Produces:**
- `localStamp(date) → 'yyyy-MM-dd HH:mm'` (giờ local)
- `scanWindow(lastRun, nowMs) → { sinceIso, jqlSince, jqlFallback }` — `lastRun` lùi 30 phút; vắng → `sinceIso` = now−4h, `jqlSince: null`, `jqlFallback: '-4h'`
- `ticketsOf(files, repo, issues) → KEY[]` — file khớp `paths[].repo === repo` và bắt đầu bằng `path + '/'`
- `designQueues(issues, nowMs) → { designScanDue: KEY[], driveCheck: [{key, link, sourceModified}] }`
- `monthsStale(months, now) → boolean`

- [ ] **Step 1: Test đỏ**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { localStamp, scanWindow, ticketsOf, designQueues, monthsStale } from './delta-scan.mjs';

process.env.TZ = 'Asia/Ho_Chi_Minh';
const H = 3600e3;
const NOW = Date.parse('2026-09-23T04:00:00Z'); // 11:00 giờ VN

test('cửa sổ quét = lastRun lùi 30 phút, in giờ local', () => {
  assert.deepStrictEqual(scanWindow('2026-09-23T03:00:00Z', NOW), {
    sinceIso: '2026-09-23T02:30:00.000Z', jqlSince: '2026-09-23 09:30', jqlFallback: null,
  });
});

test('thiếu lastRun thì lùi 4 giờ và báo JQL dùng fallback', () => {
  assert.deepStrictEqual(scanWindow(null, NOW), { sinceIso: '2026-09-23T00:00:00.000Z', jqlSince: null, jqlFallback: '-4h' });
});

test('commit nối ticket theo repo + tiền tố folder, không nối nhầm folder trùng đầu tên', () => {
  const issues = {
    'GW-1': { paths: [{ repo: 'cdn-source', path: 'products/jxm/landing/2026-a' }] },
    'GW-2': { paths: [{ repo: 'gt-promotion-template', path: 'products/jxm/landing/2026-a' }] },
  };
  assert.deepStrictEqual(ticketsOf(['products/jxm/landing/2026-a/index.html'], 'cdn-source', issues), ['GW-1']);
  assert.deepStrictEqual(ticketsOf(['products/jxm/landing/2026-a-subweb/x.scss'], 'cdn-source', issues), []);
});

test('xếp hàng quét design: folder SharePoint quá 48h, chưa tới wait-test', () => {
  const design = (extra) => ({ status: 'đã-giao-đã-tải', manifest: 'm.json', downloadedAt: new Date(NOW - 50 * H).toISOString(), ...extra });
  const issues = {
    'GW-1': { phase: 'coding', design: design() },
    'GW-2': { phase: 'coding', design: design({ lastScanAt: new Date(NOW - 2 * H).toISOString() }) },
    'GW-3': { phase: 'wait-test', design: design() },
    'GW-4': { phase: 'coding', design: design({ scanDue: true }) },
    'GW-5': { phase: 'ready', design: { status: 'đã-giao-đã-tải', link: 'https://drive.google.com/drive/folders/x', sourceModified: '2026-09-01T00:00:00Z' } },
  };
  assert.deepStrictEqual(designQueues(issues, NOW), {
    designScanDue: ['GW-1'],
    driveCheck: [{ key: 'GW-5', link: 'https://drive.google.com/drive/folders/x', sourceModified: '2026-09-01T00:00:00Z' }],
  });
});

test('months.json cũ khi generatedAt khác hôm nay theo giờ local', () => {
  assert.strictEqual(monthsStale({ generatedAt: '2026-09-23' }, new Date(NOW)), false);
  assert.strictEqual(monthsStale({ generatedAt: '2026-09-22T23:00:00+07:00' }, new Date(NOW)), true);
  assert.strictEqual(monthsStale(null, new Date(NOW)), true);
});
```

- [ ] **Step 2:** `node --test tools/delta-scan.test.mjs` → FAIL (module chưa có).
- [ ] **Step 3:** Viết 5 hàm theo Interfaces. Dải phase quét design: `waiting-design`, `ready`, `coding`, `deliver`. Mốc design = `lastScanAt ?? downloadedAt`, quá 48h. `monthsStale`: so `localStamp(now).slice(0, 10)` với ngày local của `generatedAt` (chuỗi 10 ký tự thì so thẳng).
- [ ] **Step 4:** Test xanh 5/5.
- [ ] **Step 5:** Commit `[tools] Add delta-scan pure helpers for the daily radar`.

### Task 2: `delta-scan` git + CLI

**Files:** Modify `tools/delta-scan.mjs`, `tools/delta-scan.test.mjs`.

**Interfaces:**
- Produces: `gitScan(dir, sinceIso, { pull }) → { ok, error?, stale, commits: [{hash, date, author, subject, files}] }`;
  `deltaScan({ root, now }) → { window, repos: {name: {stale, error?, commits, untracked}}, byTicket, monthsStale, designScanDue, driveCheck, ms }`;
  CLI `node tools/delta-scan.mjs [--root <agent-auto>]` in JSON.

- [ ] **Step 1: Test đỏ** — repo git thật trong tmp:

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitScan } from './delta-scan.mjs';

const git = (cwd, args, env = {}) => execFileSync('git', args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });

test('gitScan: commit ghi +0000 vẫn in đúng giờ local, kèm file đổi', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delta-'));
  git(dir, ['init', '-q']);
  fs.mkdirSync(path.join(dir, 'a'));
  fs.writeFileSync(path.join(dir, 'a', 'x.html'), '1');
  git(dir, ['add', '.']);
  const when = { GIT_AUTHOR_DATE: '2026-09-20T09:06:00+0000', GIT_COMMITTER_DATE: '2026-09-20T09:06:00+0000' };
  git(dir, ['-c', 'user.name=bot', '-c', 'user.email=b@x', 'commit', '-qm', 'cms bot'], when);
  const r = gitScan(dir, '2026-09-20T00:00:00Z', { pull: false });
  assert.strictEqual(r.stale, false);
  assert.deepStrictEqual(r.commits.map(({ date, author, subject, files }) => ({ date, author, subject, files })), [
    { date: '2026-09-20 16:06', author: 'bot', subject: 'cms bot', files: ['a/x.html'] },
  ]);
});

test('gitScan: không phải repo git thì báo lỗi, đánh dấu stale, không ném', () => {
  const r = gitScan(fs.mkdtempSync(path.join(os.tmpdir(), 'nogit-')), '2026-09-20T00:00:00Z', { pull: false });
  assert.strictEqual(r.stale, true);
  assert.ok(r.error);
  assert.deepStrictEqual(r.commits, []);
});
```

- [ ] **Step 2:** Chạy → FAIL `gitScan` chưa export.
- [ ] **Step 3:** `gitScan`: `pull` → `git pull --ff-only --quiet`, không thì `git fetch --quiet --all`; lỗi bước này → `stale: true` + `error`, vẫn chạy `log`. `log`: `git log --all --since=<sinceIso> --date=format-local:%Y-%m-%d %H:%M --pretty=format:%x1e%H%x1f%ad%x1f%an%x1f%s --name-only`, tách theo `\x1e`. `log` hỏng → `commits: []`, `stale: true`. Mọi `execFileSync` có `timeout: 60e3`. `deltaScan` đọc `config.json` (`repos`), `state.json`, `history/months.json`; `pull: true` chỉ cho `gt-promotion-template`; gộp `byTicket` qua `ticketsOf`, còn lại đếm `untracked`.
- [ ] **Step 4:** Test xanh 7/7; chạy thật `time node tools/delta-scan.mjs | head -c 1500` → JSON hợp lệ, < 20s.
- [ ] **Step 5:** Commit `[tools] Add delta-scan git scan and CLI`.

### Task 3: `radar-tick` — cổng đủ bước + `--effort`

**Files:** Modify `tools/radar-tick.mjs`, `tools/radar-tick.test.mjs`.

**Interfaces — Produces:** `buildArgs(prompt, model, effort)`; `stepCheck({ root, startedMs, lastRunBefore, now }) → { board, lastRun, months }`; `decideNotify({ ..., stepsMissing })` có kind `steps`; dòng radar thêm `effort`, `steps`, `stepsMissing` (chỉ lượt `/daily delta`).

- [ ] **Step 1: Test đỏ**

```js
test('effort để trống thì KHÔNG truyền --effort; có thì truyền', () => {
  assert.equal(buildArgs('/daily delta').includes('--effort'), false);
  assert.deepEqual(buildArgs('/daily delta', null, 'medium').slice(-2), ['--effort', 'medium']);
});

test('cổng đủ bước: board ghi sau lúc bắt đầu, lastRun đổi, months của hôm nay', () => {
  const d = tmp('steps-');
  const now = new Date(2026, 8, 23, 11, 0);
  fs.mkdirSync(path.join(d, 'boards'), { recursive: true });
  fs.mkdirSync(path.join(d, 'history'), { recursive: true });
  fs.writeFileSync(path.join(d, 'boards/2026-09-23.md'), 'x');
  fs.writeFileSync(path.join(d, 'state.json'), JSON.stringify({ lastRun: 'mới' }));
  fs.writeFileSync(path.join(d, 'history/months.json'), JSON.stringify({ generatedAt: '2026-09-22' }));
  assert.deepEqual(stepCheck({ root: d, startedMs: Date.now() - 60e3, lastRunBefore: 'cũ', now }), { board: true, lastRun: true, months: false });
  assert.deepEqual(stepCheck({ root: d, startedMs: Date.now() + 60e3, lastRunBefore: 'mới', now }), { board: false, lastRun: false, months: false });
});

test('bỏ bước thì báo NGAY, đứng sau lỗi hỏng/đăng nhập', () => {
  assert.deepEqual(decideNotify({ ok: true, stepsMissing: ['board'] }), { send: true, kind: 'steps' });
  assert.deepEqual(decideNotify({ ok: false, err: 'please /login', stepsMissing: ['board'] }), { send: true, kind: 'auth' });
});
```

- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Code: `buildArgs` thêm `effort`; `realClaude(root, timeoutMs, model, prompt, effort)`; `runTick` đọc `cfg.effort`, trước lượt lưu `startedMs` + `lastRunBefore`, sau lượt `/daily delta` gọi `stepCheck` → `steps`, `stepsMissing`; `decideNotify` thêm nhánh `stepsMissing.length` sau 2 nhánh `!ok`; `MSG.steps`. Test runTick cũ nào vỡ vì claude giả không ghi board/state → cho claude giả làm đủ bước bằng helper `doSteps(d)` (không nới cổng).
- [ ] **Step 4:** `node --test tools/radar-tick.test.mjs` xanh toàn bộ.
- [ ] **Step 5:** Commit `[tools] Add delta step gate and effort knob to radar-tick`.

### Task 4: SKILL `daily` dùng `delta-scan` + đo thật

**Files:** Modify `skills/daily/SKILL.md` (mode `delta`, dòng 101–153), `config.json` (`radar.effort` + `_note`).

- [ ] **Step 1:** Mode `delta` mở đầu bằng `node <AGENT_AUTO>/tools/delta-scan.mjs` → dùng `window.jqlSince`/`jqlFallback` cho (1), `repos`/`byTicket` cho (2)(2b), `monthsStale` cho (4), `designScanDue`/`driveCheck` cho (5). Các đoạn bẫy git (fetch/format-local/timeout) thu thành 1 dòng "đã khoá trong `delta-scan` + test", giữ ca thật làm lý do ngắn; giữ nguyên luật GW-805 và luật (4) KHÔNG bỏ.
- [ ] **Step 2:** `node tools/radar-tick.mjs --force` (effort mặc định) → đọc dòng cuối `history/radar.jsonl`: `steps` đủ 3, ghi `ms`, `costUsd`.
- [ ] **Step 3:** Đặt `config.radar.effort = "medium"`, `--force` lần 2 → `steps` đủ 3 thì giữ; thiếu → xoá `effort`, ghi lý do vào `_note`.
- [ ] **Step 4:** Commit `[skills] Use delta-scan in daily delta mode` (SKILL + config), báo số trước/sau.
