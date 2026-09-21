# Phiên tự mở + 2 tín hiệu bug — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Console tự mở sẵn phiên claude đầu ngày, và tự báo 2 tín hiệu bug đang bị bỏ lọt: QC mở lại bug đã xong, và ticket vào giai đoạn QC test mà chưa có buglist.

**Architecture:** Không dựng hệ mới. Hai tín hiệu thêm vào `buildAlerts()` — chỗ DUY NHẤT sinh cảnh báo — nên tự chảy qua dải cảnh báo console và `notifyNewCrits()` (thông báo macOS cho alert `crit` mới). Preset terminal dùng cờ `fresh` mà server đã gửi sẵn trong message `attached`, nên phiên nối lại sau reload không bị gõ đè.

**Tech Stack:** Node CJS phía server (`console/server/`), ESM + jQuery + xterm phía client (`console/src/`), test bằng `node --test` (`*.test.mjs` đặt cạnh file).

## Global Constraints

- Code style `~/VNG/agent-auto/rules/code-style.md` (R-CS-1..7): comment tối giản 1 dòng đúng 3 loại; không phòng thủ thừa; không tách hàm cho thứ dùng 1 lần; tên thay comment.
- Phase/mốc CHỈ được suy từ `schema/vocab.json` qua `server/lib/vocab.js` — cấm viết thẳng chuỗi phase trong code nghiệp vụ.
- Mã alert (`code`) là khoá chống spam trong `history/notified.jsonl` — mã mới phải là chuỗi mới, không đổi mã cũ.
- Việc ghi ra ngoài (ghi sheet, ghi Jira) không bao giờ tự Enter; chỉ gõ sẵn bằng `typeDraft`.
- Cổng nghiệm thu cuối: `cd console && npm run check` xanh (lint · test · test:tools · build · doctor).
- Không push. Commit từng task theo chuẩn repo nội bộ: `[<leaf-folder>] <English subject>` + trailer `Co-Authored-By` + `Claude-Session`.

---

### Task 1: Cờ `qcTest` trong vocab

**Files:**
- Modify: `schema/vocab.json` (phase `wait-test`)
- Modify: `console/server/lib/vocab.js` (khối `module.exports`)
- Test: `console/server/lib/vocab.test.mjs` (tạo nếu chưa có)

**Interfaces:**
- Consumes: `idsWhere(flag)` đã có sẵn trong `vocab.js`
- Produces: `QC_TEST_PHASES: string[]` — Task 3 dùng

- [ ] **Step 1: Viết test thất bại**

Thêm vào `console/server/lib/vocab.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import vocabLib from './vocab.js';

test('QC_TEST_PHASES suy từ cờ qcTest trong schema, không hardcode', () => {
  assert.deepEqual(vocabLib.QC_TEST_PHASES, ['wait-test']);
});
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd console && node --test server/lib/vocab.test.mjs`
Expected: FAIL — `QC_TEST_PHASES` là `undefined`.

- [ ] **Step 3: Thêm cờ vào schema**

Trong `schema/vocab.json`, phase `wait-test` hiện là `{"id": "wait-test", "lateExempt": true, ...}` — thêm `"qcTest": true` vào chính object đó, giữ nguyên mọi field cũ.

- [ ] **Step 4: Xuất danh sách dẫn xuất**

Trong `console/server/lib/vocab.js`, thêm vào `module.exports` (cạnh `ACTIVE_PHASES`):

```javascript
  /** Giai đoạn bug sắp về: QC đang test, buglist thường xuất hiện ở đây */
  QC_TEST_PHASES: idsWhere('qcTest'),
```

- [ ] **Step 5: Chạy test + doctor**

Run: `cd console && node --test server/lib/vocab.test.mjs && npm run doctor`
Expected: test PASS; doctor `✓ 0 ERROR · 0 WARN` (doctor đọc vocab nên phải xác nhận schema vẫn hợp lệ).

- [ ] **Step 6: Commit**

```bash
git add schema/vocab.json console/server/lib/vocab.js console/server/lib/vocab.test.mjs
git commit -m "$(cat <<'EOF'
[console] Name the QC-test phase in the vocabulary

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LE5XGHSfWa6sASQ4vNxHiK
EOF
)"
```

---

### Task 2: Cảnh báo `bug-reopened`

**Files:**
- Modify: `console/server/lib/bugs.js:206` (thêm `OPEN_FRESH_MS` vào `module.exports`)
- Modify: `console/server/lib/alerts.js` (thêm rule + tham số `nowMs`)
- Test: `console/server/lib/alerts.test.mjs`

**Interfaces:**
- Consumes: `sheetState(entry)` và `OPEN_FRESH_MS` từ `./bugs`; `label(key, text)` có sẵn trong `alerts.js`
- Produces: alert `{key, text, level: 'crit', code: 'bug-reopened', sheetUrl}`; `buildAlerts(state, today, activity, debt, nowMs)` — Task 3 và Task 4 dùng

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `console/server/lib/alerts.test.mjs`:

```javascript
const NOW_MS = Date.parse('2026-08-03T10:00:00Z');

function stateWithSheet(entry) {
  return { issues: {}, bugWatch: { s1: entry } };
}

test('QC mở lại bug trên sheet đang theo dõi → alert crit', () => {
  const alerts = buildAlerts(
    stateWithSheet({
      follow: true,
      title: 'BugList X',
      url: 'https://docs.google.com/spreadsheets/d/abc',
      keys: ['GW-100'],
      openBugsAt: '2026-08-03T08:00:00Z',
      lastScan: { reopened: ['12', '15'] },
    }),
    TODAY, {}, null, NOW_MS
  ).filter((a) => a.code === 'bug-reopened');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].level, 'crit');
  assert.equal(alerts[0].key, 'GW-100');
  assert.match(alerts[0].text, /#12, #15/);
  assert.equal(alerts[0].sheetUrl, 'https://docs.google.com/spreadsheets/d/abc');
});

test('lượt quét quá 6h → không tin, không alert', () => {
  const alerts = buildAlerts(
    stateWithSheet({
      follow: true, title: 'BugList X', keys: ['GW-100'],
      openBugsAt: '2026-08-03T02:00:00Z',
      lastScan: { reopened: ['12'] },
    }),
    TODAY, {}, null, NOW_MS
  ).filter((a) => a.code === 'bug-reopened');
  assert.equal(alerts.length, 0);
});

test('sheet đang tắt theo dõi → không alert dù có reopened', () => {
  const alerts = buildAlerts(
    stateWithSheet({
      follow: false, title: 'BugList X', keys: ['GW-100'],
      openBugsAt: '2026-08-03T09:30:00Z',
      lastScan: { reopened: ['12'] },
    }),
    TODAY, {}, null, NOW_MS
  ).filter((a) => a.code === 'bug-reopened');
  assert.equal(alerts.length, 0);
});
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd console && node --test server/lib/alerts.test.mjs`
Expected: FAIL — `alerts.length` là 0 ở test đầu (chưa có mã `bug-reopened`).

- [ ] **Step 3: Xuất hằng "tươi" từ bugs.js**

Sửa dòng cuối `console/server/lib/bugs.js`:

```javascript
module.exports = { buildBugs, sheetState, filterSheets, OPEN_FRESH_MS };
```

- [ ] **Step 4: Thêm rule vào alerts.js**

Đầu `console/server/lib/alerts.js`, thêm vào khối require sẵn có:

```javascript
const { sheetState, OPEN_FRESH_MS } = require('./bugs');
```

Đổi chữ ký (thêm tham số cuối, mọi lời gọi cũ giữ nguyên hành vi):

```javascript
function buildAlerts(state, today, activity = {}, debt = null, nowMs = Date.now()) {
```

Ngay TRƯỚC khối `const rank = { crit: 0, warn: 1 };` ở cuối hàm, thêm:

```javascript
  // QC mở lại bug đã báo xong — dấu hiệu dễ tuột nhất vì mình đã coi như đóng sổ
  for (const entry of Object.values(state.bugWatch || {})) {
    const ids = entry.lastScan?.reopened || [];
    if (!ids.length || sheetState(entry) !== 'following') continue;
    if (!entry.openBugsAt || nowMs - Date.parse(entry.openBugsAt) >= OPEN_FRESH_MS) continue;
    out.push({
      ...label((entry.keys || [])[0] || '', `${ids.length} bug bị QC mở lại: #${ids.join(', #')} — ${entry.title || 'buglist'}`),
      level: 'crit',
      code: 'bug-reopened',
      sheetUrl: entry.url || null,
    });
  }
```

- [ ] **Step 5: Chạy test**

Run: `cd console && node --test server/lib/alerts.test.mjs`
Expected: PASS toàn bộ, kể cả các test mốc có sẵn.

- [ ] **Step 6: Commit**

```bash
git add console/server/lib/alerts.js console/server/lib/alerts.test.mjs console/server/lib/bugs.js
git commit -m "$(cat <<'EOF'
[console] Raise an alert when QC reopens a bug we called done

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LE5XGHSfWa6sASQ4vNxHiK
EOF
)"
```

---

### Task 3: Cảnh báo `qc-test-no-buglist`

**Files:**
- Modify: `console/server/lib/alerts.js`
- Test: `console/server/lib/alerts.test.mjs`

**Interfaces:**
- Consumes: `QC_TEST_PHASES` (Task 1), `isOffMyPlate` đã require sẵn trong `alerts.js`
- Produces: alert `{key, text, level: 'warn', code: 'qc-test-no-buglist'}`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `console/server/lib/alerts.test.mjs`:

```javascript
test('ticket đang QC test mà chưa có buglist → alert warn', () => {
  const state = { issues: { 'GW-796': { phase: 'wait-test', summary: 'H5 đua xe' } }, bugWatch: {} };
  const alerts = buildAlerts(state, TODAY, {}, null, NOW_MS).filter((a) => a.code === 'qc-test-no-buglist');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].level, 'warn');
  assert.equal(alerts[0].key, 'GW-796');
});

test('ticket QC test đã có buglist → im', () => {
  const state = {
    issues: { 'GW-796': { phase: 'wait-test' } },
    bugWatch: { s1: { follow: true, keys: ['GW-796'] } },
  };
  const alerts = buildAlerts(state, TODAY, {}, null, NOW_MS).filter((a) => a.code === 'qc-test-no-buglist');
  assert.equal(alerts.length, 0);
});

test('ticket đã bàn giao người khác → im dù đang QC test', () => {
  const state = { issues: { 'GW-796': { phase: 'wait-test', assigneeNow: 'ai đó' } }, bugWatch: {} };
  const alerts = buildAlerts(state, TODAY, {}, null, NOW_MS).filter((a) => a.code === 'qc-test-no-buglist');
  assert.equal(alerts.length, 0);
});
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd console && node --test server/lib/alerts.test.mjs`
Expected: FAIL — test đầu ra 0 alert.

- [ ] **Step 3: Thêm rule**

Trong `console/server/lib/alerts.js`, thêm `QC_TEST_PHASES` vào dòng require `./vocab` đã có, rồi thêm ngay SAU vòng lặp `bug-reopened`:

```javascript
  // Ticket đã sang tay QC mà chưa ai giao buglist — chỗ bug sắp về nhưng không có gì để theo dõi
  const watchedKeys = new Set(Object.values(state.bugWatch || {}).flatMap((e) => e.keys || []));
  for (const [key, issue] of Object.entries(state.issues || {})) {
    if (isOffMyPlate(issue) || !QC_TEST_PHASES.includes(issue.phase) || watchedKeys.has(key)) continue;
    out.push({
      ...label(key, 'đang ở giai đoạn QC test mà chưa có buglist nào — đòi link từ QC/PM'),
      level: 'warn',
      code: 'qc-test-no-buglist',
    });
  }
```

- [ ] **Step 4: Chạy test**

Run: `cd console && node --test server/lib/alerts.test.mjs`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add console/server/lib/alerts.js console/server/lib/alerts.test.mjs
git commit -m "$(cat <<'EOF'
[console] Warn when a ticket reaches QC with no buglist attached

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LE5XGHSfWa6sASQ4vNxHiK
EOF
)"
```

---

### Task 4: Nút gõ sẵn lệnh trên cảnh báo reopened

**Files:**
- Modify: `console/src/panels/todayPanel.js` (hàm render dải `#alerts`, quanh dòng 407)
- Modify: `console/src/styles/alerts.css`

**Interfaces:**
- Consumes: alert có `code === 'bug-reopened'` và `sheetUrl` (Task 2); `ctx.terminals.typeDraft(cmd)` đã có sẵn (`initTodayPanel({ terminals, notify })`)
- Produces: không có gì cho task sau

- [ ] **Step 1: Thêm nút vào markup alert**

Trong `console/src/panels/todayPanel.js`, hàm render `#alerts`, thêm vào cuối mỗi dòng alert:

```javascript
${a.code === 'bug-reopened' && a.sheetUrl ? `<button type="button" class="abtn" data-fixbug="${escapeHtml(a.sheetUrl)}">fix bug</button>` : ''}
```

- [ ] **Step 2: Nối handler gõ sẵn (KHÔNG Enter)**

Trong `initTodayPanel`, cạnh các handler delegate sẵn có:

```javascript
  // Gõ sẵn, không Enter: fix bug là việc chạm sheet chung với QC, user tự bấm chạy
  $('#alerts').on('click', '[data-fixbug]', (e) => ctx.terminals.typeDraft('/bug-fixer-lite ' + $(e.currentTarget).data('fixbug')));
```

- [ ] **Step 3: CSS cho nút**

Thêm vào `console/src/styles/alerts.css`:

```css
.alert .abtn {
  margin-left: auto;
  padding: 2px 8px;
  font-size: var(--fs-xs);
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.alert .abtn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 4: Chứng minh alert mang đủ dữ liệu cho nút**

State thật hiện chưa có `reopened` nào, nên `curl /api/alerts` KHÔNG chứng minh được gì. Chạy
thẳng hàm trên state giả — đây mới là bằng chứng nút có dữ liệu để hiện:

```bash
cd console && node -e "
const { buildAlerts } = require('./server/lib/alerts');
const state = { issues: {}, bugWatch: { s1: { follow: true, title: 'BugList X',
  url: 'https://docs.google.com/spreadsheets/d/abc', keys: ['GW-100'],
  openBugsAt: new Date().toISOString(), lastScan: { reopened: ['12'] } } } };
console.log(JSON.stringify(buildAlerts(state, '2026-09-21').filter(a => a.code === 'bug-reopened')));
"
```
Expected: in ra 1 alert có đủ `code: 'bug-reopened'` và `sheetUrl` — hai thứ mà markup ở Step 1 dựa vào.

Sau đó `npm run build` phải xanh (nút nằm trong bundle).
Việc nhìn tận mắt nút trên dải cảnh báo chỉ làm được khi có reopen thật; ghi nhận là kiểm thủ công, không giả vờ đã đo.

- [ ] **Step 5: Commit**

```bash
git add console/src/panels/todayPanel.js console/src/styles/alerts.css
git commit -m "$(cat <<'EOF'
[console] Offer the fix command straight from a reopened-bug alert

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LE5XGHSfWa6sASQ4vNxHiK
EOF
)"
```

---

### Task 5: Preset 2 tab + lệnh khởi động

**Files:**
- Create: `console/src/terminal/startup.mjs`
- Create: `console/src/terminal/startup.test.mjs`
- Modify: `config.json` (thêm khối `terminal`)
- Modify: `console/server/ws/terminal.js:63`
- Modify: `console/src/terminal/TerminalManager.js` (`restore`, `create`, `connect`)

**Interfaces:**
- Consumes: message `{type:'attached', fresh, resumed}` mà server đã gửi ở `ws/terminal.js:63`
- Produces: `startupInput(msg) -> string | null` (đọc `msg.fresh` + `msg.startup`)

- [ ] **Step 1: Viết test thất bại**

Tạo `console/src/terminal/startup.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { startupInput } from './startup.mjs';

test('phiên mới + có lệnh → gõ lệnh kèm Enter', () => {
  assert.equal(startupInput({ fresh: true, startup: 'claude' }), 'claude\r');
});

test('phiên nối lại sau reload → không gõ gì (claude có thể đang chạy)', () => {
  assert.equal(startupInput({ fresh: false, startup: 'claude' }), null);
});

test('không khai lệnh → không gõ gì', () => {
  assert.equal(startupInput({ fresh: true }), null);
  assert.equal(startupInput({ fresh: true, startup: '' }), null);
});
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd console && node --test src/terminal/startup.test.mjs`
Expected: FAIL — `Cannot find module './startup.mjs'`.

- [ ] **Step 3: Viết module**

Tạo `console/src/terminal/startup.mjs`:

```javascript
/**
 * Lệnh khởi động CHỈ được gõ vào phiên pty mới sinh. Phiên nối lại sau reload có thể đang chạy
 * claude dở — gõ thêm vào đó là chèn chữ vào giữa phiên đang làm việc.
 */
export function startupInput(msg = {}) {
  if (!msg.fresh || !msg.startup) return null;
  return msg.startup + '\r';
}
```

- [ ] **Step 4: Chạy test**

Run: `cd console && node --test src/terminal/startup.test.mjs`
Expected: `pass 3 · fail 0`.

- [ ] **Step 5: Khai lệnh trong config**

Thêm vào `config.json` (cùng cấp với `radar`, `bugRadar`):

```json
  "terminal": { "startupCommand": "claude" },
```

- [ ] **Step 6: Server gửi lệnh kèm message attached**

Trong `console/server/ws/terminal.js`, đọc config cạnh các require sẵn có:

```javascript
const { readJSON } = require('../lib/fsutil');
```

Trong handler connection, lấy cờ từ URL và gửi kèm (sửa đúng dòng 63):

Đã kiểm: dòng 3 hiện là `const { PTY_CWD } = require('../lib/paths');` — sửa thành
`const { PTY_CWD, file } = require('../lib/paths');`. URL đã được parse sẵn ở dòng 53
(`new URL(req.url, 'http://localhost')`) — dùng lại đúng biến đó, đừng parse lần hai:

```javascript
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id') || 'anon-' + Date.now();
    const startup =
      url.searchParams.get('startup') === '1' ? readJSON(file.config, {}).terminal?.startupCommand || '' : '';
```

rồi sửa dòng 63:

```javascript
    send({ type: 'attached', fresh, resumed: !fresh, startup });
```

- [ ] **Step 7: Client gõ lệnh khi phiên mới**

Trong `console/src/terminal/TerminalManager.js`:

```javascript
import { startupInput } from '@terminal/startup.mjs';
```

`create(label, id)` nhận thêm tuỳ chọn:

```javascript
  create(label, id, { startup = false } = {}) {
```

và truyền xuống `connect`: đổi `this.connect(session)` thành `this.connect(session, startup)`; trong `connect(session, startup = false)` sửa URL:

```javascript
    const ws = new WebSocket(`ws://${location.host}/term?id=${encodeURIComponent(session.id)}${startup ? '&startup=1' : ''}`);
```

Trong nhánh `msg.type === 'attached'`, sau `session.resumed = msg.resumed;`:

```javascript
        const input = startupInput(msg);
        if (input) this.send(session, { type: 'input', data: input });
```

- [ ] **Step 8: Preset 2 tab cho lần mở đầu**

Trong `restore()`, thay nhánh chưa có tab cũ:

```javascript
    if (!saved.length) {
      this.create('term 1', null, { startup: true });
      this.create('term 2');
      return this.activate(0);
    }
```

- [ ] **Step 9: Verify toàn bộ**

Run: `cd console && npm run check`
Expected: lint sạch · test PASS (gồm 3 test mới) · test:tools PASS · build compiled successfully · doctor `0 ERROR`.

Kiểm tay: `npm start`, mở `http://127.0.0.1:4747` ở cửa sổ ẩn danh (localStorage trống = "lần đầu") → đúng 2 tab, tab 1 có prompt claude, tab 2 là shell. Sau đó F5 → **không** có chữ `claude` nào bị gõ thêm vào tab đang chạy.

- [ ] **Step 10: Commit**

```bash
git add config.json console/server/ws/terminal.js console/src/terminal/TerminalManager.js console/src/terminal/startup.mjs console/src/terminal/startup.test.mjs
git commit -m "$(cat <<'EOF'
[console] Open the day with a claude session and a spare shell

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LE5XGHSfWa6sASQ4vNxHiK
EOF
)"
```
