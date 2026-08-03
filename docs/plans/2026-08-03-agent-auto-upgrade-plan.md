# Agent-auto Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa vốn từ của `state.json` về một nguồn duy nhất, có validator + test khoá lại, rồi dựng 5 tính năng dùng chính nền đó.

**Architecture:** `schema/vocab.json` là nguồn sự thật cho phase · loại mốc · trạng thái design. Server (CJS) `require` nó qua `server/lib/vocab.js`; client (ESM) `import … with { type: 'json' }` qua alias webpack `@schema`; skill `/daily` trỏ tới nó thay vì kể lại bằng prose. Mọi logic thuần (định dạng, chia nhóm, đặt nhãn mốc, dự báo, quyết định nhắc) nằm trong module `.mjs` không phụ thuộc DOM/SVG để `node --test` chạy được trực tiếp.

**Tech Stack:** Node 25 · webpack 5.109 · jQuery 4 · xterm · Express 4 · node:test · eslint flat config · lucide-static.

## Global Constraints

- **KHÔNG tự `git commit`/`git push`.** Mỗi task kết thúc bằng *đề xuất* commit: in lệnh ra và **hỏi user**. Chỉ chạy khi user đồng ý. Format: `[agent-auto] <English subject>` + trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **KHÔNG ghi gì lên Jira.** Không đụng repo `gt-promotion-template`.
- **Đã verify trước khi viết plan** (đừng verify lại): `node --test` và `webpack --mode development` đều nạp được `import v from "./vocab.json" with { type: "json" }`; webpack cần `.mjs` trong `resolve.extensions` (hiện chỉ có `.js`). `tools/fe-gate.test.mjs` là script độc lập, `18 pass`, `process.exit(fail ? 1 : 0)` → `node --test "../tools/*.test.mjs"` gom được nó.
- **Server đang chạy nền** (`npm start`, PID đổi theo phiên) và **host các tab terminal node-pty**. Task nào sửa `server/**` thì kết thúc bằng dòng nhắc "cần user tự restart", **không tự kill process**.
- Mọi lần ghi vào `agent-auto/` phải đi qua `server/lib/backup.js` (snapshot `.backups/`, ghi atomic tmp+rename).
- Chạy mọi lệnh npm **trong `console/`** (gốc `agent-auto/` không có `package.json`).
- Tiếng Việt cho mọi nhãn UI, comment giải thích *vì sao*, và câu commit dùng tiếng Anh cho phần subject.

---

## File Structure

**Tạo mới**

| File | Trách nhiệm |
|---|---|
| `schema/vocab.json` | Nguồn sự thật: phase · loại mốc · trạng thái design |
| `console/server/lib/vocab.js` | CJS wrapper: phơi mảng dẫn xuất cho server |
| `console/src/core/constants.mjs` | ESM: dựng `PHASE`/`TASK_GROUPS`/… từ vocab (thay `constants.js`) |
| `console/src/core/format.mjs` | Hàm thuần định dạng (đổi tên từ `format.js`) |
| `console/src/core/grouping.mjs` | `groupTasks()` — chia nhóm + đếm, không DOM |
| `console/src/core/marks.mjs` | `layoutMarks()` — đặt nhãn mốc trên trục, không SVG |
| `console/src/core/*.test.mjs` | node:test cho 4 module thuần trên |
| `tools/state-doctor.mjs` | Validator `state.json`/`config.json` theo vocab |
| `tools/state-doctor.test.mjs` | node:test cho từng luật E/W |
| `console/server/routes/doctor.js` | `GET /api/doctor` |
| `console/eslint.config.mjs` | Flat config |
| `tools/build-dashboard.mjs` | Sinh khối DATA của `dashboard.html` từ state |
| `tools/build-dashboard.test.mjs` | node:test cho generator |
| `console/server/lib/delta.js` + `.test.mjs` | So 2 mốc thời gian trong `history/*.jsonl` |
| `console/server/routes/delta.js` | `GET /api/delta?since=` |
| `console/server/lib/notify.js` + `.test.mjs` | `shouldNotify()` thuần + `sendNotification()` osascript |
| `console/server/lib/forecast.js` + `.test.mjs` | `forecast()` dự báo ngày xong |
| `console/server/routes/handoff.js` | `GET/POST /api/handoff/:key` |
| `~/.claude/skills/daily/references/jql.md` · `sharepoint.md` · `nexus.md` | Phần tra cứu tách khỏi SKILL.md |

**Sửa**

`console/webpack.config.js` (`.mjs` + alias `@schema`) · `console/package.json` (scripts + devDeps) · `console/src/panels/todayPanel.js` (dùng `grouping.mjs`, bỏ logic nhóm) · `console/src/components/gantt.js` (dùng `marks.mjs`) · `console/src/index.js` + 5 panel (đổi import `@core/format` → `.mjs`) · `console/server/lib/alerts.js` (dùng vocab) · `console/server/routes/state.js` (dùng vocab) · `console/server/index.js` (mount 3 route mới + gọi doctor lúc boot) · `README.md` + `console/README.md` · `~/.claude/skills/daily/SKILL.md`.

**Xoá:** `console/server/lib/phases.js` (bị `vocab.js` thay).

---

## Task 0: Nền build — `.mjs` + alias `@schema` + `.gitignore`

**Files:**
- Modify: `console/webpack.config.js:16-22`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: —
- Produces: webpack resolve được `.mjs` và alias `@schema` → `<repo>/schema`. Mọi task sau dựa vào 2 thứ này.

- [ ] **Step 1: Thêm `.mjs` + alias vào webpack**

Trong `console/webpack.config.js`, thay khối `resolve`:

```js
    resolve: {
      // `.mjs` là BẮT BUỘC: module thuần được test bằng `node --test` phải là ESM thật,
      // mà package.json không có "type":"module" nên `.js` bị Node coi là CJS.
      extensions: ['.js', '.mjs'],
      alias: {
        '@core': path.resolve(__dirname, 'src/core'),
        '@panels': path.resolve(__dirname, 'src/panels'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@terminal': path.resolve(__dirname, 'src/terminal'),
      },
    },
```

- [ ] **Step 2: Soát `.gitignore`**

Đọc `.gitignore` hiện có. Bảo đảm có đủ 4 dòng này (thêm dòng nào thiếu, không xoá dòng nào đang có):

```
designs/
.backups/
console/node_modules/
console/dist/
```

- [ ] **Step 3: Build thật để chắc chưa gãy gì**

Run: `cd console && npm run build`
Expected: `webpack compiled successfully`, in ra `3 assets`.

- [ ] **Step 4: Đề xuất commit đầu tiên (HỎI USER)**

Repo **chưa có commit nào**. In ra cho user và **chờ đồng ý**, đừng tự chạy:

```bash
git add -A
git commit -m "$(cat <<'EOF'
[agent-auto] Add daily orchestrator, console cockpit and quality gates

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1: `schema/vocab.json` + `server/lib/vocab.js`

**Files:**
- Create: `schema/vocab.json`
- Create: `console/server/lib/vocab.js`
- Create: `console/server/lib/vocab.test.mjs`
- Delete: `console/server/lib/phases.js`
- Modify: `console/server/lib/alerts.js:1-2,28`
- Modify: `console/server/routes/state.js:8,45-62`

**Interfaces:**
- Consumes: —
- Produces: `require('./vocab')` → `{ vocab, PHASE_IDS, PHASE_BY_ID, OFF_MY_PLATE_PHASES, HTML_TODO_PHASES, HTML_DONE_PHASES, LATE_EXEMPT_PHASES, MILESTONE_IDS, MILESTONE_BY_ID, MUST_DELIVER_IDS, DESIGN_STATUS_IDS }` — mọi giá trị là `string[]` trừ `vocab` (object) và 2 map `*_BY_ID`.

- [ ] **Step 1: Viết test trước**

Tạo `console/server/lib/vocab.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import vocabLib from './vocab.js';

test('9 phase, không trùng id', () => {
  assert.equal(vocabLib.PHASE_IDS.length, 9);
  assert.equal(new Set(vocabLib.PHASE_IDS).size, 9);
});

test('offMyPlate = đúng reassigned + closed', () => {
  assert.deepEqual([...vocabLib.OFF_MY_PLATE_PHASES].sort(), ['closed', 'reassigned']);
});

test('deliver KHÔNG được miễn trễ mốc — đang giao mà quá mốc HTML vẫn là trễ', () => {
  assert.ok(vocabLib.HTML_DONE_PHASES.includes('deliver'));
  assert.ok(!vocabLib.LATE_EXEMPT_PHASES.includes('deliver'));
});

test('duedate là mốc hành chính, không phải mốc phải giao', () => {
  assert.ok(vocabLib.MILESTONE_IDS.includes('duedate'));
  assert.ok(!vocabLib.MUST_DELIVER_IDS.includes('duedate'));
});
```

- [ ] **Step 2: Chạy để thấy nó đỏ**

Run: `cd console && node --test server/lib/vocab.test.mjs`
Expected: FAIL — `Cannot find module './vocab.js'`.

- [ ] **Step 3: Tạo `schema/vocab.json`**

```json
{
  "version": 1,
  "phases": [
    { "id": "waiting-design", "label": "chờ design", "icon": "wait", "sev": "wait", "group": "Chờ design", "htmlTodo": true },
    { "id": "ready", "label": "sẵn sàng", "icon": "ready", "sev": "ok", "group": "Sẵn sàng", "htmlTodo": true },
    { "id": "coding", "label": "đang code", "icon": "coding", "sev": "warn", "group": "Đang code", "htmlTodo": true, "active": true },
    { "id": "deliver", "label": "giao HTML", "icon": "deliver", "sev": "warn", "group": "Giao HTML", "htmlDone": true, "active": true },
    { "id": "wait-test", "label": "chờ test", "icon": "test", "sev": "wait", "group": "Chờ test", "htmlDone": true, "lateExempt": true },
    { "id": "bugfix", "label": "fix bug", "icon": "bug", "sev": "crit", "group": "Fix bug", "htmlDone": true, "active": true, "lateExempt": true },
    { "id": "done-fe", "label": "xong FE", "icon": "done", "sev": "ok", "group": "Đã xong / ra khỏi tay", "htmlDone": true, "lateExempt": true, "dim": true, "folded": true },
    { "id": "reassigned", "label": "đã chuyển người", "icon": "handoff", "sev": "wait", "group": "Đã xong / ra khỏi tay", "offMyPlate": true, "lateExempt": true, "folded": true },
    { "id": "closed", "label": "đóng", "icon": "closed", "sev": "wait", "group": "Đã xong / ra khỏi tay", "htmlDone": true, "offMyPlate": true, "lateExempt": true, "folded": true }
  ],
  "milestones": [
    { "id": "design", "label": "Design", "mustDeliver": true },
    { "id": "html", "label": "HTML", "mustDeliver": true, "key": true },
    { "id": "deliver", "label": "Giao HTML", "mustDeliver": true },
    { "id": "dev", "label": "Dev BE", "mustDeliver": true },
    { "id": "test", "label": "Test", "mustDeliver": true },
    { "id": "bugfix", "label": "Fix bug", "mustDeliver": true },
    { "id": "release", "label": "Release", "mustDeliver": true },
    { "id": "review1", "label": "Review 1", "mustDeliver": true },
    { "id": "review2", "label": "Review 2", "mustDeliver": true },
    { "id": "duedate", "label": "Due Jira", "mustDeliver": false }
  ],
  "designStatus": [
    { "id": "đã-giao-đã-tải", "label": "design đã có local", "short": "local", "icon": "design-local", "sev": "ok" },
    { "id": "đã-giao-chưa-tải", "label": "design đã giao · cần bấm Download", "short": "cần tải", "icon": "design-download", "sev": "warn" },
    { "id": "chưa-có-link", "label": null }
  ]
}
```

- [ ] **Step 4: Tạo `console/server/lib/vocab.js`**

```js
const vocab = require('../../../schema/vocab.json');

/**
 * Vốn từ phía server — DẪN XUẤT từ schema/vocab.json, không tự khai lại.
 *
 * Trước đây phase nằm ở 3 chỗ (constants.js client · phases.js server · prose SKILL.md) và
 * ngày 3/8 sinh 2 bug cùng họ: skill ghi `reassigned`, console không biết từ đó nên ticket
 * vừa lọt timeline vừa mất khỏi bảng.
 */
const idsWhere = (flag) => vocab.phases.filter((p) => p[flag]).map((p) => p.id);

module.exports = {
  vocab,
  PHASE_IDS: vocab.phases.map((p) => p.id),
  PHASE_BY_ID: Object.fromEntries(vocab.phases.map((p) => [p.id, p])),
  /** Mốc không còn là deadline của mình → loại khỏi dải mốc + cảnh báo */
  OFF_MY_PLATE_PHASES: idsWhere('offMyPlate'),
  /** Còn phải làm mới ra được HTML */
  HTML_TODO_PHASES: idsWhere('htmlTodo'),
  /** Đã giao/qua giao HTML */
  HTML_DONE_PHASES: idsWhere('htmlDone'),
  /** Miễn "trễ mốc HTML". CHÚ Ý: `deliver` KHÔNG miễn — đang giao mà quá mốc thì vẫn trễ. */
  LATE_EXEMPT_PHASES: idsWhere('lateExempt'),
  MILESTONE_IDS: vocab.milestones.map((m) => m.id),
  MILESTONE_BY_ID: Object.fromEntries(vocab.milestones.map((m) => [m.id, m])),
  MUST_DELIVER_IDS: vocab.milestones.filter((m) => m.mustDeliver).map((m) => m.id),
  DESIGN_STATUS_IDS: vocab.designStatus.map((d) => d.id),
};
```

- [ ] **Step 5: Chạy test — phải xanh**

Run: `cd console && node --test server/lib/vocab.test.mjs`
Expected: `pass 4 · fail 0`.

- [ ] **Step 6: Chuyển `alerts.js` và `routes/state.js` sang vocab, xoá `phases.js`**

Trong `console/server/lib/alerts.js`: đổi 2 dòng đầu thành

```js
const { daysBetween } = require('./fsutil');
const { OFF_MY_PLATE_PHASES, HTML_DONE_PHASES, HTML_TODO_PHASES } = require('./vocab');
```

rồi **xoá** 2 hằng số khai tay `HTML_DONE_PHASES` / `HTML_TODO_PHASES` trong file (dòng 12-14 cũ), giữ nguyên `STALE_DAYS`.

Trong `console/server/routes/state.js`: đổi `require('../lib/phases')` thành

```js
const { OFF_MY_PLATE_PHASES, MUST_DELIVER_IDS } = require('../lib/vocab');
```

và trong vòng dựng `week`, thay điều kiện lọc `m.name !== 'duedate'` bằng vốn từ:

```js
    const mustDeliver = inHorizon.filter((m) => MUST_DELIVER_IDS.includes(m.name));
```

Xoá file: `rm console/server/lib/phases.js`

- [ ] **Step 7: Chạy toàn bộ test server**

Run: `cd console && node --test "server/**/*.test.mjs"`
Expected: `pass 8 · fail 0` (4 cũ của `listen` + 4 mới của `vocab`).

- [ ] **Step 8: Đề xuất commit (HỎI USER)**

```bash
git add schema/vocab.json console/server/lib/vocab.js console/server/lib/vocab.test.mjs console/server/lib/alerts.js console/server/routes/state.js console/webpack.config.js .gitignore
git rm console/server/lib/phases.js
git commit -m "$(cat <<'EOF'
[agent-auto] Make schema/vocab.json the single source of phase vocabulary

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

⚠ Task này sửa `server/**` → **nhắc user restart** console để ăn code mới.

---

## Task 2: `constants.mjs` — client đọc vocab

**Files:**
- Create: `console/src/core/constants.mjs`
- Create: `console/src/core/constants.test.mjs`
- Delete: `console/src/core/constants.js`
- Modify: mọi file `import … from '@core/constants'` (grep ra: `src/panels/todayPanel.js`, `src/panels/ticketPanel.js`, `src/panels/historyPanel.js`, `src/components/gantt.js`, `src/index.js`)

**Interfaces:**
- Consumes: `schema/vocab.json` qua alias `@schema`.
- Produces: named exports `PHASE` (`{[id]: {label, icon, sev}}`) · `ACTIVE_PHASES: string[]` · `OFF_MY_PLATE_PHASES: string[]` · `DIM_PHASES: string[]` · `LATE_EXEMPT_PHASES: string[]` · `TASK_GROUPS: {label, phases, collapsed?, where?}[]` · `MILESTONE_LABEL: {[id]: string}` · `KEY_MILESTONE_IDS: string[]` · `DESIGN_STATUS: {[id]: {label, short, icon, sev}|null}` · `COMMANDS` · `POLL_MS` · `WEEK_HORIZON_DAYS` · `IDLE` (3 cái cuối copy y nguyên từ `constants.js` cũ).

- [ ] **Step 1: Viết test trước**

Tạo `console/src/core/constants.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { PHASE, TASK_GROUPS, OFF_MY_PLATE_PHASES, DIM_PHASES, MILESTONE_LABEL } from './constants.mjs';

test('mọi phase trong vocab đều có nhãn tiếng Việt', () => {
  assert.equal(PHASE['reassigned'].label, 'đã chuyển người');
  assert.equal(PHASE['closed'].label, 'đóng');
});

test('nhóm "Đã xong / ra khỏi tay" gộp 3 phase và đóng sẵn', () => {
  const g = TASK_GROUPS.find((x) => x.label === 'Đã xong / ra khỏi tay');
  assert.deepEqual(g.phases, ['done-fe', 'reassigned', 'closed']);
  assert.equal(g.collapsed, true);
});

test('nhóm Chờ design tách 2 theo trạng thái tải design', () => {
  const labels = TASK_GROUPS.map((g) => g.label);
  assert.ok(labels.includes('Chờ design'));
  assert.ok(labels.includes('Design đã giao · chờ tải về'));
  const chua = TASK_GROUPS.find((g) => g.label === 'Design đã giao · chờ tải về');
  assert.equal(chua.where({ design: { status: 'đã-giao-chưa-tải' } }), true);
  assert.equal(chua.where({ design: { status: 'đã-giao-đã-tải' } }), false);
});

test('thứ tự nhóm: việc đang chạy trước, nhóm đóng sẵn cuối cùng', () => {
  const idx = TASK_GROUPS.findIndex((g) => g.collapsed);
  assert.equal(idx, TASK_GROUPS.length - 1);
});

test('cờ dẫn xuất', () => {
  assert.deepEqual([...OFF_MY_PLATE_PHASES].sort(), ['closed', 'reassigned']);
  assert.deepEqual(DIM_PHASES, ['done-fe']);
  assert.equal(MILESTONE_LABEL.duedate, 'Due Jira');
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd console && node --test src/core/constants.test.mjs`
Expected: FAIL — không tìm thấy `./constants.mjs`.

- [ ] **Step 3: Viết `constants.mjs`**

Copy nguyên `COMMANDS`, `POLL_MS`, `WEEK_HORIZON_DAYS`, `IDLE` từ `constants.js` cũ sang, rồi thay phần vốn từ bằng:

```js
// Đường dẫn TƯƠNG ĐỐI, không phải alias webpack: `node --test` chạy file .mjs bằng ESM resolver
// thật nên bare specifier kiểu `@schema/vocab.json` bị coi là TÊN PACKAGE → ERR_MODULE_NOT_FOUND.
// Đường dẫn tương đối là thứ duy nhất cả webpack và Node cùng hiểu. (Đã trả giá 3/8: alias làm
// test đỏ, phải dựng shim trong node_modules — shim đó bay ngay lần `npm install` kế tiếp.)
import vocab from '../../../schema/vocab.json' with { type: 'json' };

/**
 * Vốn từ phía client — DẪN XUẤT từ schema/vocab.json (xem server/lib/vocab.js cho bản server).
 * Thêm phase mới = sửa JSON, không sửa file này. Ngoại lệ duy nhất: phase cần hình icon CHƯA có
 * thì vẫn phải thêm 1 dòng import trong core/icons.js — state-doctor bắt ca đó (luật E7).
 */
const idsWhere = (flag) => vocab.phases.filter((p) => p[flag]).map((p) => p.id);

export const PHASE = Object.fromEntries(
  vocab.phases.map((p) => [p.id, { label: p.label, icon: p.icon, sev: p.sev }])
);
export const ACTIVE_PHASES = idsWhere('active');
export const OFF_MY_PLATE_PHASES = idsWhere('offMyPlate');
export const DIM_PHASES = idsWhere('dim');
export const LATE_EXEMPT_PHASES = idsWhere('lateExempt');
export const MILESTONE_LABEL = Object.fromEntries(vocab.milestones.map((m) => [m.id, m.label]));
export const KEY_MILESTONE_IDS = vocab.milestones.filter((m) => m.key).map((m) => m.id);
export const DESIGN_STATUS = Object.fromEntries(
  vocab.designStatus.map((d) => [d.id, d.label === null ? null : d])
);

/**
 * Nhóm dòng của bảng task: gom theo `group` của phase, giữ NGUYÊN thứ tự phase trong vocab
 * (việc đang chạy trước, nhóm `folded` cuối bảng).
 */
function buildGroups() {
  const out = [];
  for (const p of vocab.phases) {
    const found = out.find((g) => g.label === p.group);
    if (found) {
      found.phases.push(p.id);
      found.collapsed = found.collapsed && Boolean(p.folded);
    } else {
      out.push({ label: p.group, phases: [p.id], collapsed: Boolean(p.folded) });
    }
  }
  // Tinh chỉnh DUY NHẤT không biểu diễn được bằng JSON: `waiting-design` gộp 2 tình huống khác
  // hẳn nhau — designer chưa gửi gì, và design ĐÃ gửi mà chỉ vướng khâu tải về máy. Xếp chung
  // 1 nhóm thì đọc thành vô lý ("chờ design" mà "design đã giao").
  const i = out.findIndex((g) => g.label === 'Chờ design');
  out.splice(
    i,
    1,
    {
      label: 'Chờ design',
      phases: ['waiting-design'],
      collapsed: false,
      where: (issue) => issue.design?.status !== 'đã-giao-chưa-tải',
    },
    {
      label: 'Design đã giao · chờ tải về',
      phases: ['waiting-design'],
      collapsed: false,
      where: (issue) => issue.design?.status === 'đã-giao-chưa-tải',
    }
  );
  return out;
}

export const TASK_GROUPS = buildGroups();
```

- [ ] **Step 4: Chạy test — xanh**

Run: `cd console && node --test src/core/constants.test.mjs`
Expected: `pass 5 · fail 0`.

- [ ] **Step 5: Xoá file cũ + đổi mọi import**

```bash
cd console && rm src/core/constants.js && grep -rn "@core/constants" src | cat
```

Với mỗi dòng grep trả về, đổi `'@core/constants'` → `'@core/constants.mjs'`.

- [ ] **Step 6: Build thật**

Run: `cd console && npm run build`
Expected: `webpack compiled successfully`. Nếu báo `Can't resolve '@schema/vocab.json'` thì Task 0 Step 1 chưa xong.

- [ ] **Step 7: Đề xuất commit (HỎI USER)**

```bash
git add console/src && git commit -m "$(cat <<'EOF'
[agent-auto] Derive client phase constants from shared vocabulary

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `format.mjs` + `grouping.mjs` + `marks.mjs` — tách logic thuần và khoá bằng test

**Files:**
- Create: `console/src/core/format.mjs` (nội dung `format.js` + đổi `isLate`), `console/src/core/format.test.mjs`
- Create: `console/src/core/grouping.mjs`, `console/src/core/grouping.test.mjs`
- Create: `console/src/core/marks.mjs`, `console/src/core/marks.test.mjs`
- Delete: `console/src/core/format.js`
- Modify: `console/src/panels/todayPanel.js` (dùng `groupTasks`), `console/src/components/gantt.js` (dùng `layoutMarks`), và mọi file `import … from '@core/format'`

**Interfaces:**
- Consumes: `constants.mjs` (Task 2).
- Produces:
  - `format.mjs`: `escapeHtml(s)` · `inlineMd(s)` · `shortDate(iso)` · `toISODate(d)` · `daysUntil(iso, todayISO)` · `severityByDays(n)` · `nextMilestone(issue, todayISO)` → `{name,date,days}|undefined` · `isLate(issue, todayISO)` → `boolean` (giữ nguyên chữ ký cũ).
  - `grouping.mjs`: `FOLDED_PHASES: Set<string>` · `groupTasks(issues, {filterText, expanded})` → `{ groups: {label, phases, collapsed, folded, items}[], trackedTotal, trackedMatched, orphanCount }`. `issues` là mảng `[key, issue]`.
  - `marks.mjs`: `layoutMarks(milestones, {pctOf, daysUntilOf, keyIds, minGapPct})` → `{name, date, left, days, showLabel}[]` đã sắp theo `left` tăng dần.

- [ ] **Step 1: Viết test cho cả 3 module**

Tạo `console/src/core/format.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { nextMilestone, isLate, severityByDays, daysUntil } from './format.mjs';

const TODAY = '2026-08-03';

test('nextMilestone lấy mốc gần nhất chưa qua, bỏ key ghi chú `_`', () => {
  const issue = { milestones: { html: '2026-08-10', duedate: '2026-08-07', _conflict: 'ghi chú' } };
  assert.deepEqual(nextMilestone(issue, TODAY), { name: 'duedate', date: '2026-08-07', days: 4 });
});

test('isLate: quá mốc HTML mà vẫn đang code = trễ', () => {
  assert.equal(isLate({ phase: 'coding', milestones: { html: '2026-08-01' } }, TODAY), true);
});

test('isLate KHÔNG tính ticket đã chuyển người hoặc đã đóng', () => {
  const ms = { html: '2026-08-01' };
  assert.equal(isLate({ phase: 'reassigned', milestones: ms }, TODAY), false);
  assert.equal(isLate({ phase: 'closed', milestones: ms }, TODAY), false);
});

test('isLate VẪN tính phase deliver — đang giao mà quá mốc thì vẫn trễ', () => {
  assert.equal(isLate({ phase: 'deliver', milestones: { html: '2026-08-01' } }, TODAY), true);
});

test('severity theo số ngày còn lại', () => {
  assert.equal(severityByDays(2), 'crit');
  assert.equal(severityByDays(6), 'warn');
  assert.equal(severityByDays(20), 'ok');
  assert.equal(daysUntil('2026-08-05', TODAY), 2);
});
```

Tạo `console/src/core/grouping.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { groupTasks } from './grouping.mjs';

const mk = (key, phase, extra = {}) => [key, { phase, summary: key + ' summary', ...extra }];
const BASE = [
  mk('GW-1', 'coding'),
  mk('GW-2', 'waiting-design'),
  mk('GW-3', 'reassigned'),
  mk('GW-4', 'closed'),
];

test('phase LẠ vẫn ra dòng, gom vào nhóm riêng — không được mất im lặng', () => {
  const r = groupTasks([...BASE, mk('GW-9', 'phase-troi-oi')]);
  const orphan = r.groups.find((g) => g.label.startsWith('Phase lạ'));
  assert.equal(orphan.items.length, 1);
  assert.equal(r.orphanCount, 1);
});

test('trackedTotal = số task NGOÀI nhóm đóng sẵn (bug đếm lệch 3/8)', () => {
  const r = groupTasks(BASE);
  assert.equal(r.trackedTotal, 2); // GW-1, GW-2 — GW-3/GW-4 nằm trong nhóm đóng
});

test('nhóm đóng sẵn nằm cuối và mặc định folded', () => {
  const r = groupTasks(BASE);
  const last = r.groups[r.groups.length - 1];
  assert.equal(last.label, 'Đã xong / ra khỏi tay');
  assert.equal(last.folded, true);
});

test('user mở nhóm ra thì không tự đóng lại', () => {
  const r = groupTasks(BASE, { expanded: { 'Đã xong / ra khỏi tay': true } });
  assert.equal(r.groups[r.groups.length - 1].folded, false);
});

test('đang lọc thì nhóm đóng phải MỞ, không thì đọc thành "không tìm thấy"', () => {
  const r = groupTasks(BASE, { filterText: 'GW-3' });
  const g = r.groups.find((x) => x.label === 'Đã xong / ra khỏi tay');
  assert.equal(g.folded, false);
  assert.equal(r.trackedMatched, 0);
});

test('lọc khớp key, summary hoặc note', () => {
  const r = groupTasks([mk('GW-7', 'coding', { note: 'chờ cắt ảnh' })], { filterText: 'cắt ảnh' });
  assert.equal(r.groups[0].items.length, 1);
});
```

Tạo `console/src/core/marks.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { layoutMarks } from './marks.mjs';

// Trục giả: mỗi ngày cách nhau 5% — 2026-08-01 = 0%, 08-02 = 5%…
const pctOf = (iso) => {
  const day = Number(iso.slice(8, 10));
  return day >= 1 && day <= 20 ? (day - 1) * 5 : null;
};
const daysUntilOf = (iso) => Number(iso.slice(8, 10)) - 3;

test('key ghi chú `_` không bao giờ thành chấm mốc', () => {
  const marks = layoutMarks({ html: '2026-08-05', _conflict: 'Jira 5/8 vs nexus 17/8' }, { pctOf, daysUntilOf });
  assert.deepEqual(marks.map((m) => m.name), ['html']);
});

test('mốc ngoài trục bị bỏ', () => {
  const marks = layoutMarks({ html: '2026-09-30' }, { pctOf, daysUntilOf });
  assert.equal(marks.length, 0);
});

test('2 mốc gần nhau: chỉ 1 nhãn hiện', () => {
  const marks = layoutMarks({ test: '2026-08-05', release: '2026-08-06' }, { pctOf, daysUntilOf, minGapPct: 10 });
  assert.deepEqual(marks.map((m) => m.showLabel), [true, false]);
});

test('mốc HTML luôn giành được nhãn dù đứng sau mốc khác', () => {
  const marks = layoutMarks({ design: '2026-08-05', html: '2026-08-06' }, { pctOf, daysUntilOf, minGapPct: 10 });
  const html = marks.find((m) => m.name === 'html');
  const design = marks.find((m) => m.name === 'design');
  assert.equal(html.showLabel, true);
  assert.equal(design.showLabel, false);
});
```

- [ ] **Step 2: Chạy 3 file test để thấy đỏ**

Run: `cd console && node --test "src/core/*.test.mjs"`
Expected: FAIL — thiếu `./format.mjs`, `./grouping.mjs`, `./marks.mjs`.

- [ ] **Step 3: Tạo `format.mjs`**

`git mv console/src/core/format.js console/src/core/format.mjs`, rồi thay `isLate` bằng bản đọc vốn từ:

```js
import { LATE_EXEMPT_PHASES } from './constants.mjs';

/**
 * Mốc HTML đã qua mà phase chưa được miễn → coi là trễ.
 * `deliver` KHÔNG nằm trong danh sách miễn: đang giao HTML mà quá mốc thì vẫn là trễ.
 */
export function isLate(issue, todayISO) {
  const html = (issue.milestones || {}).html;
  if (!html) return false;
  return daysUntil(html, todayISO) < 0 && !LATE_EXEMPT_PHASES.includes(issue.phase);
}
```

- [ ] **Step 4: Tạo `grouping.mjs`**

```js
import { TASK_GROUPS } from './constants.mjs';

/** Phase nằm trong nhóm đóng sẵn — suy từ TASK_GROUPS để ĐẾM và NHÓM không bao giờ lệch nhau */
export const FOLDED_PHASES = new Set(TASK_GROUPS.filter((g) => g.collapsed).flatMap((g) => g.phases));

/**
 * Chia nhóm + đếm cho bảng task. Hàm THUẦN (không DOM) để test được — ngày 3/8 hai bug
 * nằm đúng ở đây: phase lạ bị bỏ im lặng, và số đếm tiêu đề lệch số dòng vẽ ra.
 *
 * @param issues  mảng [key, issue]
 * @param filterText  chuỗi lọc (khớp key · summary · note)
 * @param expanded    { [label]: true } — nhóm user đã bấm mở
 */
export function groupTasks(issues, { filterText = '', expanded = {} } = {}) {
  const q = String(filterText).trim().toLowerCase();
  const matched = issues.filter(([key, i]) =>
    !q || (key + ' ' + (i.summary || '') + ' ' + (i.note || '')).toLowerCase().includes(q)
  );

  const groups = TASK_GROUPS.map((g) => ({
    label: g.label,
    phases: g.phases,
    collapsed: Boolean(g.collapsed),
    items: matched.filter(([, i]) => g.phases.includes(i.phase) && (!g.where || g.where(i))),
  })).filter((g) => g.items.length);

  // TASK_GROUPS là WHITELIST phase: phase lạ (skill ghi giá trị console chưa biết) trước đây
  // rơi vào hư không. Giờ gom thành nhóm hiện rõ để còn biết mà khai bổ sung.
  const shown = new Set(groups.flatMap((g) => g.items.map(([key]) => key)));
  const orphans = matched.filter(([key]) => !shown.has(key));
  if (orphans.length) {
    groups.push({ label: 'Phase lạ — console chưa khai báo', phases: [], collapsed: false, items: orphans });
  }

  // Nhóm đóng sẵn luôn xuống cuối, kể cả khi có nhóm "phase lạ" chen vào (sort ổn định)
  groups.sort((a, b) => (a.collapsed ? 1 : 0) - (b.collapsed ? 1 : 0));
  for (const g of groups) g.folded = g.collapsed && expanded[g.label] !== true && !q;

  const isTracked = ([, i]) => !FOLDED_PHASES.has(i.phase);
  return {
    groups,
    trackedTotal: issues.filter(isTracked).length,
    trackedMatched: matched.filter(isTracked).length,
    orphanCount: orphans.length,
  };
}
```

- [ ] **Step 5: Tạo `marks.mjs`**

```js
/**
 * Đặt nhãn cho các mốc trên trục timeline. Tách khỏi gantt.js để test được: gantt.js import
 * icon (.svg qua webpack) nên node:test không nạp được file đó.
 *
 * Nhãn xét 2 LƯỢT: mốc ưu tiên (HTML) giành chỗ TRƯỚC. Xét 1 lượt trái→phải thì HTML ở sau
 * vẫn hiện cạnh nhãn vừa hiện và chồng chữ.
 */
export function layoutMarks(milestones, { pctOf, daysUntilOf, keyIds = ['html'], minGapPct = 10 }) {
  const marks = Object.entries(milestones || {})
    // Key mở đầu `_` là GHI CHÚ của skill (`_conflict`, `_designGuess`…), không phải mốc.
    // Không lọc thì nó vẽ ra chấm + nhãn tên-field (đã thấy thật: "_dueda" đè "HTML").
    .filter(([name]) => !name.startsWith('_'))
    .map(([name, date]) => ({ name, date, left: pctOf(date), days: daysUntilOf(date) }))
    .filter((m) => m.left !== null)
    .sort((a, b) => a.left - b.left);

  const taken = [];
  const fits = (left) => taken.every((t) => Math.abs(left - t) >= minGapPct);
  for (const m of marks.filter((m) => keyIds.includes(m.name))) {
    m.showLabel = true;
    taken.push(m.left);
  }
  for (const m of marks.filter((m) => !keyIds.includes(m.name))) {
    m.showLabel = fits(m.left);
    if (m.showLabel) taken.push(m.left);
  }
  return marks;
}
```

- [ ] **Step 6: Chạy test — xanh**

Run: `cd console && node --test "src/core/*.test.mjs"`
Expected: `pass 20 · fail 0` (5 constants + 5 format + 6 grouping + 4 marks).

- [ ] **Step 7: Cắm 2 module vào chỗ dùng thật**

Trong `console/src/components/gantt.js`: bỏ khối tính `marks` + 2 vòng gán `showLabel` (dòng 61-84 hiện tại), thay bằng

```js
import { layoutMarks } from '@core/marks.mjs';
import { KEY_MILESTONE_IDS } from '@core/constants.mjs';
…
      const marks = layoutMarks(issue.milestones, {
        pctOf: pct,
        daysUntilOf: (date) => daysUntil(date, todayISO),
        keyIds: KEY_MILESTONE_IDS,
        minGapPct: LABEL_MIN_GAP_PCT,
      });
```

Trong `console/src/panels/todayPanel.js`: xoá `FOLDED_PHASES`, xoá khối dựng `groups`/`orphans`/`sort`/đếm trong `rerenderTasks` (giữ phần vẽ), thay bằng

```js
import { groupTasks } from '@core/grouping.mjs';
…
  const { groups, trackedTotal, trackedMatched } = groupTasks(issues, { filterText, expanded: expandedGroups });
  $('#task-count').text(trackedMatched === trackedTotal ? `(${trackedTotal})` : `(${trackedMatched}/${trackedTotal})`);
```

và đổi biến trạng thái `collapsedGroups` thành `expandedGroups` (nghĩa đảo lại: `true` = user đã mở), handler `[data-fold]` thành

```js
      const label = String($(this).data('fold'));
      expandedGroups[label] = !expandedGroups[label];
      rerenderTasks();
```

Trong phần vẽ dòng nhóm, dùng `g.folded` do `groupTasks` trả về thay cho biến `folded` tính tại chỗ.

- [ ] **Step 8: Đổi mọi import `@core/format`**

```bash
cd console && grep -rln "@core/format'" src | cat
```

Đổi từng file: `'@core/format'` → `'@core/format.mjs'`. Rồi build:

Run: `cd console && npm run build`
Expected: `webpack compiled successfully`.

- [ ] **Step 9: Verify bằng browser thật (1920×1080)**

Mở `http://localhost:4747`, refresh, rồi khẳng định 3 điều: bảng có nhóm "Đã xong / ra khỏi tay" đóng sẵn với số đếm 2 · tiêu đề `(3)` khớp đúng 3 dòng hiện · bấm nhóm → 5 dòng, bấm lại → 3.

- [ ] **Step 10: Đề xuất commit (HỎI USER)**

```bash
git add console/src && git commit -m "$(cat <<'EOF'
[agent-auto] Extract pure grouping, format and mark-layout modules with tests

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `tools/state-doctor.mjs` — validator + self-test

**Files:**
- Create: `tools/state-doctor.mjs`, `tools/state-doctor.test.mjs`

**Interfaces:**
- Consumes: `schema/vocab.json`.
- Produces: `runDoctor({ root })` → `{ at: string, errors: Finding[], warns: Finding[] }` với `Finding = { code, key, text }`. CLI: `node tools/state-doctor.mjs [--json <path>] [--root <dir>]`, exit `1` nếu có error.

- [ ] **Step 1: Viết test trước**

Tạo `tools/state-doctor.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDoctor } from './state-doctor.mjs';

/** Dựng 1 agent-auto giả trong folder tạm: chỉ cần state.json + config.json + icons.js */
function fixture(state, config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'));
  fs.writeFileSync(path.join(root, 'state.json'), JSON.stringify({ schemaVersion: 2, issues: {}, ...state }));
  fs.writeFileSync(
    path.join(root, 'config.json'),
    JSON.stringify({ repos: { 'cdn-source': root }, ...config })
  );
  fs.mkdirSync(path.join(root, 'console/src/core'), { recursive: true });
  fs.cpSync(new URL('../schema/vocab.json', import.meta.url), path.join(root, 'schema/vocab.json'), {
    recursive: false,
    force: true,
    mode: 0,
  });
  return root;
}

const codes = (list) => list.map((f) => f.code).sort();

test('state sạch → không phát hiện gì', () => {
  const root = fixture({
    issues: { 'GW-1': { phase: 'coding', milestones: { html: '2026-08-10' }, paths: [{ repo: 'cdn-source', path: '.' }] } },
  });
  const r = runDoctor({ root, skipIcons: true });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(codes(r.warns), []);
});

test('E1 phase lạ', () => {
  const root = fixture({ issues: { 'GW-1': { phase: 'gi-vay-troi', milestones: { html: '2026-08-10' } } } });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E1'));
});

test('E2 key mốc lạ, nhưng key `_` là ghi chú nên bỏ qua', () => {
  const bad = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: { hmtl: '2026-08-10' } } } });
  assert.ok(codes(runDoctor({ root: bad, skipIcons: true }).errors).includes('E2'));
  const ok = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: { html: '2026-08-10', _conflict: 'x' } } } });
  assert.ok(!codes(runDoctor({ root: ok, skipIcons: true }).errors).includes('E2'));
});

test('E3 ngày không phải YYYY-MM-DD', () => {
  const root = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: { html: '10/08/2026' } } } });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E3'));
});

test('E4 design.status ngoài enum', () => {
  const root = fixture({
    issues: { 'GW-1': { phase: 'coding', milestones: { html: '2026-08-10' }, design: { status: 'gần xong' } } },
  });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E4'));
});

test('E5 thiếu schemaVersion', () => {
  const root = fixture({ schemaVersion: undefined, issues: {} });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E5'));
});

test('E6 repo không khai trong config', () => {
  const root = fixture({
    issues: { 'GW-1': { phase: 'coding', milestones: { html: '2026-08-10' }, paths: [{ repo: 'repo-la', path: '.' }] } },
  });
  assert.ok(codes(runDoctor({ root, skipIcons: true }).errors).includes('E6'));
});

test('W2 đang code mà không có paths · W4 không có mốc nào', () => {
  const root = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: {} } } });
  const w = codes(runDoctor({ root, skipIcons: true }).warns);
  assert.ok(w.includes('W2'));
  assert.ok(w.includes('W4'));
});

test('W3 reassigned mà chưa có handoff.md · W5 còn _conflict', () => {
  const root = fixture({
    issues: { 'GW-1': { phase: 'reassigned', milestones: { html: '2026-08-10', _conflict: 'x' } } },
  });
  const w = codes(runDoctor({ root, skipIcons: true }).warns);
  assert.ok(w.includes('W3'));
  assert.ok(w.includes('W5'));
});

test('exit code: có error → 1, chỉ warn → 0', () => {
  const bad = fixture({ issues: { 'GW-1': { phase: 'x', milestones: { html: '2026-08-10' } } } });
  const warnOnly = fixture({ issues: { 'GW-1': { phase: 'coding', milestones: {} } } });
  assert.equal(runDoctor({ root: bad, skipIcons: true }).errors.length > 0, true);
  assert.equal(runDoctor({ root: warnOnly, skipIcons: true }).errors.length, 0);
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd /Users/lap17727/VNG/agent-auto && node --test tools/state-doctor.test.mjs`
Expected: FAIL — không tìm thấy `./state-doctor.mjs`.

- [ ] **Step 3: Viết `tools/state-doctor.mjs`**

```js
#!/usr/bin/env node
/**
 * state-doctor — soi state.json/config.json theo hợp đồng schema/vocab.json.
 *
 * Vì sao cần: `state.json` do LLM (skill /daily) ghi, nên nó có thể sinh key/giá trị mới bất
 * cứ lúc nào. Ngày 3/8 skill ghi `phase: "reassigned"` — console không biết từ đó nên ticket
 * vừa lọt timeline vừa mất khỏi bảng. Sai hợp đồng phải ỒN ÀO, không được im lặng.
 *
 * Chạy: node tools/state-doctor.mjs [--json knowledge/doctor.json] [--root <dir>]
 * Exit ≠ 0 khi còn ERROR (giống tools/fe-gate.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REPO_ROOT = path.resolve(import.meta.dirname, '..');

const readJSON = (p, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
};

/** Tên icon đã khai trong core/icons.js — dùng cho luật E7 */
function iconNames(root) {
  const src = fs.readFileSync(path.join(root, 'console/src/core/icons.js'), 'utf8');
  const block = src.slice(src.indexOf('const RAW = {'), src.indexOf('};', src.indexOf('const RAW = {')));
  return new Set(
    [...block.matchAll(/^\s*'?([\w-]+)'?\s*[:,]/gm)].map((m) => m[1]).filter((n) => n !== 'RAW')
  );
}

export function runDoctor({ root = REPO_ROOT, skipIcons = false } = {}) {
  const vocab = readJSON(path.join(root, 'schema/vocab.json')) || readJSON(path.join(REPO_ROOT, 'schema/vocab.json'));
  const state = readJSON(path.join(root, 'state.json'), {});
  const config = readJSON(path.join(root, 'config.json'), {});
  const errors = [];
  const warns = [];
  const err = (code, key, text) => errors.push({ code, key, text });
  const warn = (code, key, text) => warns.push({ code, key, text });

  const phaseIds = new Set(vocab.phases.map((p) => p.id));
  const milestoneIds = new Set(vocab.milestones.map((m) => m.id));
  const designIds = new Set(vocab.designStatus.map((d) => d.id));

  if (state.schemaVersion !== 2) err('E5', '(state)', `schemaVersion phải là 2, đang là ${state.schemaVersion}`);

  if (!skipIcons) {
    const icons = iconNames(root);
    for (const p of vocab.phases) {
      if (p.icon && !icons.has(p.icon)) {
        err('E7', '(vocab)', `phase "${p.id}" khai icon "${p.icon}" mà core/icons.js không có`);
      }
    }
  }

  for (const [key, issue] of Object.entries(state.issues || {})) {
    if (!phaseIds.has(issue.phase)) {
      err('E1', key, `phase "${issue.phase}" không có trong vocab (${[...phaseIds].join(' · ')})`);
    }

    const ms = issue.milestones || {};
    for (const [name, date] of Object.entries(ms)) {
      if (name.startsWith('_')) continue; // ghi chú của skill, không phải mốc
      if (!milestoneIds.has(name)) err('E2', key, `key mốc "${name}" không có trong vocab`);
      if (!ISO_DATE.test(String(date))) err('E3', key, `mốc "${name}" = "${date}" không phải YYYY-MM-DD`);
    }
    if (Object.keys(ms).filter((n) => !n.startsWith('_')).length === 0) {
      warn('W4', key, 'không có mốc nào — không biết deadline');
    }
    if (Object.keys(ms).includes('_conflict')) {
      warn('W5', key, 'mốc còn tranh chấp (_conflict) — chưa hỏi lại ai');
    }

    if (issue.design?.status && !designIds.has(issue.design.status)) {
      err('E4', key, `design.status "${issue.design.status}" ngoài enum`);
    }

    const paths = issue.paths || [];
    for (const p of paths) {
      if (!config.repos?.[p.repo]) err('E6', key, `paths.repo "${p.repo}" không có trong config.repos`);
      else if (!fs.existsSync(path.join(config.repos[p.repo], p.path))) {
        warn('W1', key, `paths "${p.repo}/${p.path}" không tồn tại trên đĩa`);
      }
    }
    if (!paths.length && ['coding', 'deliver'].includes(issue.phase)) {
      warn('W2', key, `phase "${issue.phase}" mà chưa gắn paths — không đo được effort`);
    }
    if (issue.phase === 'reassigned' && !fs.existsSync(path.join(root, 'tasks', key, 'handoff.md'))) {
      warn('W3', key, 'đã chuyển người mà chưa có tasks/' + key + '/handoff.md');
    }
  }

  return { at: new Date().toISOString(), errors, warns };
}

/* ── CLI ── */
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : null;
  };
  const report = runDoctor({ root: arg('--root') || REPO_ROOT });
  for (const e of report.errors) console.log(`✖ ${e.code} ${e.key}: ${e.text}`);
  for (const w of report.warns) console.log(`⚠ ${w.code} ${w.key}: ${w.text}`);
  console.log(`\n${report.errors.length ? '✖' : '✓'} ${report.errors.length} ERROR · ${report.warns.length} WARN\n`);
  const json = arg('--json');
  if (json) fs.writeFileSync(path.resolve(json), JSON.stringify(report, null, 1));
  process.exit(report.errors.length ? 1 : 0);
}
```

- [ ] **Step 4: Chạy test — xanh**

Run: `cd /Users/lap17727/VNG/agent-auto && node --test tools/state-doctor.test.mjs`
Expected: `pass 10 · fail 0`.

- [ ] **Step 5: Chạy trên state THẬT**

Run: `cd /Users/lap17727/VNG/agent-auto && node tools/state-doctor.mjs`
Expected: `0 ERROR`. Nếu có WARN (vd W3 cho GW-654 chưa có handoff.md, W5 cho `_conflict`) thì đúng — Task 8 mới sinh handoff.

- [ ] **Step 6: Đề xuất commit (HỎI USER)**

```bash
git add tools/state-doctor.mjs tools/state-doctor.test.mjs && git commit -m "$(cat <<'EOF'
[agent-auto] Add state-doctor validator with 12 contract rules

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `/api/doctor` + hiện lỗi hợp đồng lên dải cảnh báo

**Files:**
- Create: `console/server/routes/doctor.js`
- Modify: `console/server/index.js` (mount route + gọi doctor lúc boot)
- Modify: `console/src/core/api.js` (thêm `api.doctor()`)
- Modify: `console/src/panels/todayPanel.js` (trộn phát hiện của doctor vào dải cảnh báo)

**Interfaces:**
- Consumes: `runDoctor()` (Task 4), dải cảnh báo hiện có trong `todayPanel.js` (`renderAlerts`, mỗi item `{key, text, level, code}`).
- Produces: `GET /api/doctor` → `{ at, errors, warns }`; `api.doctor()` trả cùng shape.

- [ ] **Step 1: Viết route**

Tạo `console/server/routes/doctor.js`:

```js
const { Router } = require('express');
const path = require('path');
const { AGENT_AUTO } = require('../lib/paths');

const router = Router();

/**
 * GET /api/doctor — state.json có đúng hợp đồng vocab không.
 * `state-doctor` là ESM nên phải dynamic import từ file CJS này (Node cho phép).
 */
router.get('/doctor', async (_req, res) => {
  try {
    const { runDoctor } = await import(path.join(AGENT_AUTO, 'tools', 'state-doctor.mjs'));
    res.json(runDoctor({ root: AGENT_AUTO }));
  } catch (e) {
    // Doctor chết không được làm sập cockpit — trả rỗng kèm lý do
    res.json({ at: new Date().toISOString(), errors: [], warns: [], failed: String(e.message || e) });
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount + chạy lúc boot**

Trong `console/server/index.js`, cạnh các `app.use('/api', require('./routes/…'))` khác thêm:

```js
app.use('/api', require('./routes/doctor'));
```

và sau khi server listen thành công, in kết quả doctor 1 lần (không chặn khởi động):

```js
    import(path.join(AGENT_AUTO, 'tools', 'state-doctor.mjs'))
      .then(({ runDoctor }) => {
        const r = runDoctor({ root: AGENT_AUTO });
        if (r.errors.length) console.log(`⚠ state-doctor: ${r.errors.length} ERROR — mở /api/doctor để xem`);
      })
      .catch(() => {});
```

- [ ] **Step 3: Kiểm bằng curl**

Run: `cd console && npm run serve` ở một terminal khác (cổng sẽ nhảy nếu 4747 đang bận), rồi
`curl -s http://localhost:<cổng>/api/doctor | head -c 300`
Expected: JSON có `"errors":[]` và mảng `warns`.

- [ ] **Step 4: Nối vào dải cảnh báo**

Trong `console/src/core/api.js` thêm `doctor: () => get('/api/doctor'),` (theo đúng khuôn các hàm sẵn có).

Trong `console/src/panels/todayPanel.js`, chỗ đang nạp alerts theo `ALERT_REFRESH_MS`, nạp thêm doctor và trộn vào cùng dải:

```js
/** Lỗi hợp đồng state là loại cảnh báo NGHIÊM TRỌNG nhất: mọi con số khác đều dựa trên state */
async function loadDoctor() {
  try {
    const r = await api.doctor();
    doctorItems = r.errors.map((e) => ({
      key: e.key,
      text: `state.json sai hợp đồng (${e.code}): ${e.text}`,
      level: 'crit',
      code: 'doctor-' + e.code,
    }));
  } catch {
    doctorItems = [];
  }
}
```

Khai `let doctorItems = [];` cạnh `let alerts = [];`, gọi `loadDoctor()` cùng nhịp `loadAlerts()`, và khi vẽ dải thì dùng `[...doctorItems, ...alerts]`.

- [ ] **Step 5: Build + xem thật**

Run: `cd console && npm run build`
Expected: `compiled successfully`. Sau đó tạm thêm `"phase": "xxx"` cho 1 ticket trong một **bản copy** state ở `/tmp` và chạy `node tools/state-doctor.mjs --root /tmp/<copy>` để thấy E1 nổ. **Không sửa `state.json` thật.**

- [ ] **Step 6: Đề xuất commit (HỎI USER)** — nhắc user restart server.

```bash
git add console/server console/src && git commit -m "$(cat <<'EOF'
[agent-auto] Surface state contract errors in the console alert strip

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: eslint + `npm run check`

**Files:**
- Create: `console/eslint.config.mjs`
- Modify: `console/package.json`

**Interfaces:**
- Consumes: mọi task trước.
- Produces: `npm run check` = lint → test (server + client + tools) → build → doctor. Đây là cổng chốt duy nhất cho "xong chưa".

- [ ] **Step 1: Cài eslint**

Run: `cd console && npm i -D eslint @eslint/js`
Expected: `added N packages`.

- [ ] **Step 2: Viết `console/eslint.config.mjs`**

```js
import js from '@eslint/js';

/**
 * Flat config, cố tình HẸP: đợt này chỉ bắt lỗi thật (biến chết, `==`), KHÔNG format lại code cũ
 * — format toàn bộ sẽ tạo diff rác che mất thay đổi có nghĩa.
 */
const browser = {
  window: 'readonly', document: 'readonly', localStorage: 'readonly', navigator: 'readonly',
  Notification: 'readonly', WebSocket: 'readonly', fetch: 'readonly', location: 'readonly',
  URLSearchParams: 'readonly', requestAnimationFrame: 'readonly', console: 'readonly',
  setTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', clearTimeout: 'readonly',
};
const node = {
  require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly',
  Buffer: 'readonly', console: 'readonly', setTimeout: 'readonly', setInterval: 'readonly',
  URL: 'readonly', fetch: 'readonly',
};

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'src/**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: browser },
    rules: { eqeqeq: 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['server/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: node },
    rules: { eqeqeq: 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['server/**/*.test.mjs', 'src/**/*.test.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: node },
  },
];
```

- [ ] **Step 3: Chạy lint, sửa hết lỗi thật**

Run: `cd console && npx eslint .`
Expected: có thể ra vài lỗi `no-unused-vars` từ code cũ — **sửa từng cái** (xoá biến chết / đổi tên tham số thành `_x`). Không tắt rule để cho qua.

- [ ] **Step 4: Thêm scripts**

Trong `console/package.json`, khối `scripts` thành:

```json
  "scripts": {
    "build": "webpack --mode production",
    "dev": "webpack --mode development --watch",
    "serve": "node server/index.js",
    "start": "npm run build && node server/index.js",
    "lint": "eslint .",
    "test": "node --test \"server/**/*.test.mjs\" \"src/**/*.test.mjs\"",
    "test:tools": "node --test \"../tools/*.test.mjs\"",
    "doctor": "node ../tools/state-doctor.mjs",
    "dashboard": "node ../tools/build-dashboard.mjs",
    "check": "npm run lint && npm test && npm run test:tools && npm run build && npm run doctor"
  },
```

- [ ] **Step 5: Chạy cổng chốt**

Run: `cd console && npm run check`
Expected: lint sạch · `pass 20+` client/server · `pass 10` doctor + `18 pass` fe-gate · `compiled successfully` · `0 ERROR` doctor.

- [ ] **Step 6: Đề xuất commit (HỎI USER)**

```bash
git add console/eslint.config.mjs console/package.json console/package-lock.json console/src console/server && git commit -m "$(cat <<'EOF'
[agent-auto] Add eslint and a single npm run check gate

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `dashboard.html` sinh tự động

**Files:**
- Create: `tools/build-dashboard.mjs`, `tools/build-dashboard.test.mjs`
- Modify: `dashboard.html` (chỉ khối DATA, do generator ghi)

**Interfaces:**
- Consumes: `schema/vocab.json`, `state.json`, `boards/<today>.md`, marker sẵn có trong `dashboard.html`: `/* ===== DATA — /daily regenerate phần này mỗi lần chạy ===== */` … `/* ===== hết phần DATA ===== */`.
- Produces: `buildBoardData({ state, boardMd, today, vocab })` → `{ date, week, tasks, todos, weekWarn }`; `renderDashboard({ root, today })` → ghi `dashboard.html`, trả `{ tasks: number, week: number }`.

- [ ] **Step 1: Viết test trước**

Tạo `tools/build-dashboard.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { buildBoardData } from './build-dashboard.mjs';
import vocab from '../schema/vocab.json' with { type: 'json' };

const TODAY = '2026-08-03';
const state = {
  issues: {
    'GW-1': { phase: 'coding', summary: 'A', milestones: { html: '2026-08-07', duedate: '2026-08-05' } },
    'GW-2': { phase: 'reassigned', summary: 'B', milestones: { html: '2026-08-05' } },
    'GW-3': { phase: 'waiting-design', summary: 'C', milestones: { design: '2026-08-10' } },
  },
};
const boardMd = '## Cần bạn\n\n- [ ] GW-1 — cắt 30 ảnh\n- [x] ~~xong rồi~~\n';

test('ticket đã chuyển người KHÔNG vào dashboard', () => {
  const d = buildBoardData({ state, boardMd, today: TODAY, vocab });
  assert.deepEqual(d.tasks.map((t) => t.key), ['GW-1', 'GW-3']);
});

test('dải mốc chỉ lấy mốc phải giao trong 14 ngày', () => {
  const d = buildBoardData({ state, boardMd, today: TODAY, vocab });
  assert.deepEqual(d.week.map((w) => `${w.key}:${w.name}`), ['GW-1:html', 'GW-3:design']);
});

test('mục Cần bạn: bỏ dòng đã tick', () => {
  const d = buildBoardData({ state, boardMd, today: TODAY, vocab });
  assert.deepEqual(d.todos, ['GW-1 — cắt 30 ảnh']);
});

test('status của thẻ suy từ vocab, không hardcode', () => {
  const d = buildBoardData({ state, boardMd, today: TODAY, vocab });
  assert.equal(d.tasks.find((t) => t.key === 'GW-1').status, 'running');
  assert.equal(d.tasks.find((t) => t.key === 'GW-3').status, 'waiting');
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd /Users/lap17727/VNG/agent-auto && node --test tools/build-dashboard.test.mjs`
Expected: FAIL — thiếu `./build-dashboard.mjs`.

- [ ] **Step 3: Viết `tools/build-dashboard.mjs`**

```js
#!/usr/bin/env node
/**
 * Sinh khối DATA của dashboard.html từ state.json — trước đây khối này VIẾT TAY nên tự lệch:
 * sáng 3/8 dashboard vẫn ghi GW-654 là việc của user trong khi ticket đã chuyển người từ 10:02.
 *
 * Chạy: node tools/build-dashboard.mjs   (hoặc npm run dashboard trong console/)
 */
import fs from 'node:fs';
import path from 'node:path';
import vocabDefault from '../schema/vocab.json' with { type: 'json' };

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const START = '/* ===== DATA — /daily regenerate phần này mỗi lần chạy ===== */';
const END = '/* ===== hết phần DATA ===== */';
const HORIZON = 14;

const days = (fromISO, toISO) =>
  Math.round((new Date(toISO + 'T00:00:00') - new Date(fromISO + 'T00:00:00')) / 864e5);

/** phase → status của dashboard (GROUPS trong dashboard.html) */
function statusOf(phase, vocab) {
  const p = vocab.phases.find((x) => x.id === phase);
  if (!p) return 'waiting';
  if (p.active) return 'running';
  if (p.id === 'ready') return 'planned';
  if (p.id === 'done-fe') return 'done';
  return 'waiting';
}

export function buildBoardData({ state, boardMd, today, vocab = vocabDefault }) {
  const offPlate = vocab.phases.filter((p) => p.offMyPlate).map((p) => p.id);
  const mustDeliver = vocab.milestones.filter((m) => m.mustDeliver).map((m) => m.id);
  const label = Object.fromEntries(vocab.milestones.map((m) => [m.id, m.label]));

  const entries = Object.entries(state.issues || {}).filter(([, i]) => !offPlate.includes(i.phase));

  const week = [];
  for (const [key, issue] of entries) {
    for (const [name, date] of Object.entries(issue.milestones || {})) {
      if (name.startsWith('_') || !mustDeliver.includes(name)) continue;
      const d = days(today, date);
      if (d >= 0 && d <= HORIZON) week.push({ key, name, date, label: label[name], days: d });
    }
  }
  week.sort((a, b) => a.date.localeCompare(b.date));

  const tasks = entries.map(([key, issue]) => {
    const next = week.find((w) => w.key === key);
    return {
      key,
      url: `https://vnggames.atlassian.net/browse/${key}`,
      title: issue.summary || key,
      lane: issue.lastAction || '—',
      repo: (issue.paths || [])[0]?.repo || '—',
      due: next ? next.date : today,
      dueLabel: next ? `${next.label} ${next.date.slice(5).replace('-', '/')}` : '—',
      status: statusOf(issue.phase, vocab),
      phase: (vocab.phases.find((p) => p.id === issue.phase) || {}).label || issue.phase,
      note: issue.note || '',
    };
  });

  const todos = String(boardMd || '')
    .split('\n')
    .filter((l) => l.startsWith('- [ ] '))
    .map((l) => l.slice(6).trim());

  return { date: today, week, tasks, todos, weekWarn: '' };
}

export function renderDashboard({ root = REPO_ROOT, today = new Date().toISOString().slice(0, 10) } = {}) {
  const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8'));
  const boardPath = path.join(root, 'boards', `${today}.md`);
  const boardMd = fs.existsSync(boardPath) ? fs.readFileSync(boardPath, 'utf8') : '';
  const data = buildBoardData({ state, boardMd, today });

  const file = path.join(root, 'dashboard.html');
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf(START);
  const b = html.indexOf(END);
  if (a < 0 || b < 0) throw new Error('dashboard.html thiếu marker DATA — đừng ghi mù, sửa marker trước');

  const block = `${START}\nconst BOARD = ${JSON.stringify(data, null, 2)};\n`;
  const out = html.slice(0, a) + block + html.slice(b);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, file); // atomic: đứt giữa đường không để lại file rách
  return { tasks: data.tasks.length, week: data.week.length };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const r = renderDashboard({});
  console.log(`✓ dashboard.html: ${r.tasks} task · ${r.week} mốc`);
}
```

- [ ] **Step 4: Chạy test — xanh**

Run: `cd /Users/lap17727/VNG/agent-auto && node --test tools/build-dashboard.test.mjs`
Expected: `pass 4 · fail 0`.

- [ ] **Step 5: Sinh thật rồi mở xem**

Run: `cd console && npm run dashboard`
Expected: `✓ dashboard.html: 3 task · 3 mốc` (số đúng theo state lúc chạy). Mở `dashboard.html` bằng browser, khẳng định không còn GW-654 và số thẻ mốc khớp console.

- [ ] **Step 6: Đề xuất commit (HỎI USER)**

```bash
git add tools/build-dashboard.mjs tools/build-dashboard.test.mjs dashboard.html && git commit -m "$(cat <<'EOF'
[agent-auto] Generate dashboard data from state instead of hand-editing

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `/api/delta` + dòng "có gì mới từ lần bạn xem"

**Files:**
- Create: `console/server/lib/delta.js`, `console/server/lib/delta.test.mjs`, `console/server/routes/delta.js`
- Modify: `console/server/index.js` (mount), `console/src/core/api.js`, `console/src/panels/todayPanel.js`, `console/src/index.html` (1 dòng chứa `#delta-bar`), `console/src/styles/alerts.css` (style dòng delta)

**Interfaces:**
- Consumes: `history/issues.jsonl` (1 dòng/ticket mỗi lần `/daily` quét: `{at, key, summary, phase, status, duedate, milestones}`), `history/phases.jsonl` (`{at, key, from, to, reason}`).
- Produces: `buildDelta({ issueRows, phaseRows, sinceISO })` → `{ key, changes: {type, from, to, at}[] }[]` với `type ∈ 'status' | 'phase' | 'milestone' | 'duedate'`; `GET /api/delta?since=<ISO>` → `{ since, items }`.

- [ ] **Step 1: Viết test trước**

Tạo `console/server/lib/delta.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { buildDelta } from './delta.js';

const rows = [
  { at: '2026-08-03T08:00:00+07:00', key: 'GW-1', status: 'To Do', phase: 'coding', duedate: '2026-08-07', milestones: { html: '2026-08-07' } },
  { at: '2026-08-03T11:00:00+07:00', key: 'GW-1', status: 'In Progress', phase: 'coding', duedate: '2026-08-07', milestones: { html: '2026-08-10' } },
];

test('so với mốc thời gian: bắt đổi status và đổi mốc', () => {
  const items = buildDelta({ issueRows: rows, phaseRows: [], sinceISO: '2026-08-03T09:00:00+07:00' });
  const types = items[0].changes.map((c) => c.type).sort();
  assert.deepEqual(types, ['milestone', 'status']);
  const st = items[0].changes.find((c) => c.type === 'status');
  assert.deepEqual([st.from, st.to], ['To Do', 'In Progress']);
});

test('không có gì mới sau mốc → mảng rỗng', () => {
  const items = buildDelta({ issueRows: rows, phaseRows: [], sinceISO: '2026-08-03T12:00:00+07:00' });
  assert.deepEqual(items, []);
});

test('phase đổi lấy từ phases.jsonl kèm lý do', () => {
  const items = buildDelta({
    issueRows: rows,
    phaseRows: [{ at: '2026-08-03T10:00:00+07:00', key: 'GW-2', from: 'coding', to: 'done-fe', reason: 'PM nhận hàng' }],
    sinceISO: '2026-08-03T09:00:00+07:00',
  });
  const gw2 = items.find((i) => i.key === 'GW-2');
  assert.deepEqual([gw2.changes[0].type, gw2.changes[0].from, gw2.changes[0].to], ['phase', 'coding', 'done-fe']);
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd console && node --test server/lib/delta.test.mjs`
Expected: FAIL — thiếu `./delta.js`.

- [ ] **Step 3: Viết `console/server/lib/delta.js`**

```js
/**
 * "Có gì mới từ lần bạn xem" — đọc 2 sổ nhật ký đã ghi sẵn mà trước đây không ai đọc:
 * history/issues.jsonl (mỗi lần /daily quét Jira ghi 1 dòng/ticket) và history/phases.jsonl.
 * Trước đó muốn biết thay đổi phải tự chạy /daily delta.
 */
const at = (row) => new Date(row.at).getTime();

function diffRows(prev, cur) {
  const out = [];
  if (!prev) return out;
  if (prev.status !== cur.status) out.push({ type: 'status', from: prev.status, to: cur.status, at: cur.at });
  if (prev.duedate !== cur.duedate) out.push({ type: 'duedate', from: prev.duedate, to: cur.duedate, at: cur.at });
  const a = JSON.stringify(prev.milestones || {});
  const b = JSON.stringify(cur.milestones || {});
  if (a !== b) out.push({ type: 'milestone', from: a, to: b, at: cur.at });
  return out;
}

function buildDelta({ issueRows = [], phaseRows = [], sinceISO }) {
  const since = new Date(sinceISO).getTime();
  const byKey = {};

  for (const row of issueRows) {
    if (!row || !row.key) continue;
    (byKey[row.key] = byKey[row.key] || []).push(row);
  }

  const items = [];
  for (const [key, rows] of Object.entries(byKey)) {
    rows.sort((x, y) => at(x) - at(y));
    const newer = rows.filter((r) => at(r) > since);
    if (!newer.length) continue;
    const baseline = rows.filter((r) => at(r) <= since).pop() || null;
    const changes = diffRows(baseline, newer[newer.length - 1]);
    if (changes.length) items.push({ key, changes });
  }

  for (const row of phaseRows) {
    if (!row || !row.key || at(row) <= since) continue;
    const change = { type: 'phase', from: row.from, to: row.to, at: row.at, reason: row.reason };
    const found = items.find((i) => i.key === row.key);
    if (found) found.changes.unshift(change);
    else items.push({ key: row.key, changes: [change] });
  }

  return items;
}

module.exports = { buildDelta };
```

- [ ] **Step 4: Chạy test — xanh**

Run: `cd console && node --test server/lib/delta.test.mjs`
Expected: `pass 3 · fail 0`.

- [ ] **Step 5: Route + mount**

Tạo `console/server/routes/delta.js`:

```js
const { Router } = require('express');
const { file } = require('../lib/paths');
const { readJSONL } = require('../lib/fsutil');
const { buildDelta } = require('../lib/delta');

const router = Router();

router.get('/delta', (req, res) => {
  const since = req.query.since || new Date(Date.now() - 12 * 3600e3).toISOString();
  res.json({
    since,
    items: buildDelta({
      issueRows: readJSONL(file.issues),
      phaseRows: readJSONL(file.phases),
      sinceISO: since,
    }),
  });
});

module.exports = router;
```

Mount trong `console/server/index.js`: `app.use('/api', require('./routes/delta'));`

- [ ] **Step 6: Dòng "có gì mới" trên UI**

`console/src/index.html`: thêm ngay trên `#kpis` một chỗ chứa:

```html
    <div id="delta-bar"></div>
```

`console/src/core/api.js`: thêm `delta: (since) => get('/api/delta?since=' + encodeURIComponent(since)),`

`console/src/panels/todayPanel.js`: thêm

```js
const SEEN_KEY = 'daily-console:lastSeenAt';
const DELTA_LABEL = { status: 'status Jira', phase: 'phase', milestone: 'mốc', duedate: 'duedate' };

/** Dòng "có gì mới": bấm để mở danh sách, bấm nữa là đánh dấu đã xem */
async function loadDelta() {
  const since = localStorage.getItem(SEEN_KEY) || new Date(Date.now() - 12 * 3600e3).toISOString();
  let items = [];
  try {
    items = (await api.delta(since)).items;
  } catch {
    return;
  }
  const n = items.reduce((s, i) => s + i.changes.length, 0);
  if (!n) return $('#delta-bar').empty();
  const time = since.slice(11, 16);
  const detail = items
    .map((i) => `${i.key}: ${i.changes.map((c) => `${DELTA_LABEL[c.type] || c.type} ${c.from ?? '—'} → ${c.to ?? '—'}`).join(' · ')}`)
    .join('<br>');
  $('#delta-bar').html(
    `<div class="deltabar" data-delta-open>${icon('radar')}<span><b>${n} thay đổi</b> từ ${time} · xem</span></div>
     <div class="deltalist" hidden>${escapeHtml(detail).replace(/&lt;br&gt;/g, '<br>')}
       <button type="button" class="btn ghost small" data-delta-seen>đánh dấu đã xem</button></div>`
  );
}
```

Bind 1 lần trong `initTodayPanel`:

```js
  $('#delta-bar')
    .on('click', '[data-delta-open]', () => $('.deltalist').attr('hidden', (i, v) => (v ? null : 'hidden')))
    .on('click', '[data-delta-seen]', () => {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
      loadDelta();
    });
```

Gọi `loadDelta()` cùng nhịp `loadAlerts()`.

`console/src/styles/alerts.css`: thêm

```css
/* Dòng "có gì mới" — thông tin, không phải báo động, nên dùng tone accent chứ không đỏ */
.deltabar {
  display: flex; align-items: center; gap: 7px; cursor: pointer;
  padding: 6px 12px; margin-bottom: 8px; border-radius: 8px;
  background: var(--raise); border: 1px solid var(--line); color: var(--ink2);
  font-size: var(--fs-sm);
}
.deltabar:hover { border-color: var(--accent); }
.deltalist {
  padding: 8px 12px; margin-bottom: 8px; border-radius: 8px;
  background: var(--raise); border: 1px dashed var(--line);
  font-size: var(--fs-xs); line-height: 1.7; color: var(--muted);
}
```

- [ ] **Step 7: Build + xem thật**

Run: `cd console && npm run build && npm run check`
Expected: mọi thứ xanh. Refresh trang: nếu hôm nay `/daily` đã quét ≥2 lần thì thấy dòng "N thay đổi từ HH:MM".

- [ ] **Step 8: Đề xuất commit (HỎI USER)** — nhắc restart server.

```bash
git add console && git commit -m "$(cat <<'EOF'
[agent-auto] Add delta bar showing what changed since last look

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Sổ bàn giao `handoff.md`

**Files:**
- Create: `console/server/routes/handoff.js`
- Modify: `console/server/lib/board.js` (tách hàm parse checklist dùng lại được), `console/server/index.js`, `console/src/core/api.js`, `console/src/panels/ticketPanel.js`, `~/.claude/skills/daily/SKILL.md`

**Interfaces:**
- Consumes: `parseChecklist(md)` → `{ text, done }[]` (tách từ `board.js`), `writeAtomic`/`snapshot` của `server/lib/backup.js`, quy ước chống race `expectText` → 409 của `routes/board.js`.
- Produces: `GET /api/handoff/:key` → `{ exists, items }`; `POST /api/handoff/:key/check` body `{ text, expectText, done }` → `{ ok: true }` hoặc 409.

- [ ] **Step 1: Tách parser checklist dùng chung**

Trong `console/server/lib/board.js`, thêm export (giữ nguyên hàm cũ, chỉ rút phần dùng lại):

```js
/** Parse checklist markdown → [{text, done}] — dùng cho cả board "Cần bạn" và handoff.md */
function parseChecklist(md) {
  return String(md || '')
    .split('\n')
    .filter((l) => /^- \[[ x]\] /.test(l))
    .map((l) => ({ done: l.startsWith('- [x]'), text: l.slice(6).replace(/~~/g, '').trim() }));
}
```

thêm `parseChecklist` vào `module.exports`.

- [ ] **Step 2: Viết route handoff**

Tạo `console/server/routes/handoff.js`:

```js
const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { dir } = require('../lib/paths');
const { parseChecklist } = require('../lib/board');
const { writeFileAtomic } = require('../lib/backup');

const router = Router();
const KEY_RE = /^[A-Z]+-\d+$/;
const fileFor = (key) => path.join(dir.tasks, key, 'handoff.md');

router.get('/handoff/:key', (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) return res.status(400).json({ error: 'key không hợp lệ' });
  const p = fileFor(key);
  if (!fs.existsSync(p)) return res.json({ exists: false, items: [] });
  res.json({ exists: true, items: parseChecklist(fs.readFileSync(p, 'utf8')) });
});

/**
 * Tick 1 mục bàn giao. Chống race y như board: client gửi `expectText`, lệch → 409 và KHÔNG ghi
 * (agent /daily có thể đang ghi cùng lúc).
 */
router.post('/handoff/:key/check', (req, res) => {
  const key = String(req.params.key);
  if (!KEY_RE.test(key)) return res.status(400).json({ error: 'key không hợp lệ' });
  const p = fileFor(key);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'chưa có handoff.md' });

  const { text, expectText, done } = req.body || {};
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const i = lines.findIndex((l) => /^- \[[ x]\] /.test(l) && l.includes(text));
  if (i < 0) return res.status(404).json({ error: 'không tìm thấy mục' });
  if (expectText && lines[i] !== expectText) return res.status(409).json({ error: 'dòng đã đổi', current: lines[i] });

  lines[i] = done ? `- [x] ~~${text}~~` : `- [ ] ${text}`;
  writeFileAtomic(p, lines.join('\n'), 'handoff');
  res.json({ ok: true });
});

module.exports = router;
```

Nếu `server/lib/backup.js` phơi tên khác `writeFileAtomic`, đọc file đó và dùng đúng tên đang có (đừng thêm hàm mới).

Mount: `app.use('/api', require('./routes/handoff'));`

- [ ] **Step 3: Kiểm bằng curl với file giả**

```bash
mkdir -p tasks/GW-999 && printf '# Bàn giao GW-999\n\n- [ ] gửi questions-for-pm.md\n- [ ] chốt mốc với phuld\n' > tasks/GW-999/handoff.md
curl -s http://localhost:<cổng>/api/handoff/GW-999
curl -s -X POST http://localhost:<cổng>/api/handoff/GW-999/check -H 'content-type: application/json' \
  -d '{"text":"chốt mốc với phuld","expectText":"- [ ] chốt mốc với phuld","done":true}'
cat tasks/GW-999/handoff.md && rm -rf tasks/GW-999
```
Expected: lần 1 trả 2 mục `done:false`; lần 2 trả `{"ok":true}`; file có dòng `- [x] ~~chốt mốc với phuld~~`.

- [ ] **Step 4: Hiện trong drawer ticket**

`console/src/core/api.js`: thêm

```js
  handoff: (key) => get('/api/handoff/' + key),
  handoffCheck: (key, body) => post('/api/handoff/' + key + '/check', body),
```

`console/src/panels/ticketPanel.js`: trong phần dựng drawer, sau khối mốc, thêm mục bàn giao — chỉ vẽ khi có file:

```js
/** Sổ bàn giao: chỉ hiện khi ticket đã chuyển người và có tasks/<KEY>/handoff.md */
function handoffSection(key, data) {
  if (!data.exists) return '';
  const rows = data.items
    .map(
      (it) => `<li><label><input type="checkbox" data-handoff="${escapeHtml(it.text)}"
        ${it.done ? 'checked' : ''}> <span${it.done ? ' class="doneline"' : ''}>${escapeHtml(it.text)}</span></label></li>`
    )
    .join('');
  return `<section class="tsec"><h3>${icon('handoff')} Bàn giao</h3><ul class="handoff">${rows}</ul></section>`;
}
```

và bind (1 lần, trong hàm init của panel):

```js
  $('#ticket-drawer').on('change', '[data-handoff]', async function () {
    const text = String($(this).data('handoff'));
    const done = this.checked;
    await api.handoffCheck(currentKey, { text, done, expectText: (done ? '- [ ] ' : '- [x] ~~') + text + (done ? '' : '~~') });
    openTicket(currentKey, ctx.paths);
  });
```

- [ ] **Step 5: Dạy skill sinh file**

Trong `~/.claude/skills/daily/SKILL.md`, mục nói về ca đổi assignee, thêm:

```markdown
- Ticket chuyển `phase: reassigned` ⇒ **sinh `tasks/<KEY>/handoff.md`** dạng checklist
  (`- [ ] …`), gồm: mốc còn tranh chấp (`_conflict`) · `questions-for-pm.md` đã gửi chưa ·
  kết quả `fe-gate` cuối · commit đã push · việc dở NGOÀI repo bóc từ `note`.
  Console hiện checklist này trong drawer ticket và tick được. `state-doctor` W3 cảnh báo nếu thiếu.
```

- [ ] **Step 6: Sinh thật cho GW-654 rồi soi**

Viết `tasks/GW-654/handoff.md` theo đúng 4 mục đang nằm trong `state.issues['GW-654'].note`, rồi:

Run: `cd /Users/lap17727/VNG/agent-auto && node tools/state-doctor.mjs | grep W3 ; cd console && npm run check`
Expected: W3 biến mất khỏi output doctor; `npm run check` xanh.

- [ ] **Step 7: Đề xuất commit (HỎI USER)** — nhắc restart server.

```bash
git add console tasks/GW-654/handoff.md && git commit -m "$(cat <<'EOF'
[agent-auto] Add handoff checklist for reassigned tickets

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Nhắc mốc ra ngoài trang

**Files:**
- Create: `console/server/lib/notify.js`, `console/server/lib/notify.test.mjs`
- Modify: `console/server/index.js` (vòng soi 60s), `console/server/lib/paths.js` (thêm `file.notified`), `config.json` (thêm `"notify": true`), `console/README.md`

**Interfaces:**
- Consumes: `buildAlerts(state, today, activity)` (`server/lib/alerts.js`), `appendJSONL` của `server/lib/backup.js`.
- Produces: `shouldNotify(alert, log, nowMs, config)` → `boolean` (thuần); `notifyNewCrits({ alerts, log, nowMs, config })` → `{ sent: Finding[] }` (thuần, không I/O); `sendNotification(title, message)` → `void` (best-effort osascript).

- [ ] **Step 1: Viết test trước**

Tạo `console/server/lib/notify.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { shouldNotify, notifyNewCrits } from './notify.js';

const NOW = Date.parse('2026-08-03T11:00:00+07:00');
const crit = { key: 'GW-1', code: 'html-urgent', level: 'crit', text: 'mốc HTML còn 1 ngày' };
const on = { notify: true };

test('alert crit chưa từng nhắc → nhắc', () => {
  assert.equal(shouldNotify(crit, [], NOW, on), true);
});

test('vừa nhắc trong 12h → im', () => {
  const log = [{ at: '2026-08-03T06:00:00+07:00', key: 'GW-1', code: 'html-urgent' }];
  assert.equal(shouldNotify(crit, log, NOW, on), false);
});

test('quá 12h → nhắc lại', () => {
  const log = [{ at: '2026-08-02T20:00:00+07:00', key: 'GW-1', code: 'html-urgent' }];
  assert.equal(shouldNotify(crit, log, NOW, on), true);
});

test('công tắc notify=false → im hẳn', () => {
  assert.equal(shouldNotify(crit, [], NOW, { notify: false }), false);
});

test('mức warn không nhắc — chỉ crit mới xứng đáng chen ra ngoài trang', () => {
  assert.equal(shouldNotify({ ...crit, level: 'warn' }, [], NOW, on), false);
});

test('notifyNewCrits chỉ trả về những alert đáng nhắc', () => {
  const r = notifyNewCrits({
    alerts: [crit, { ...crit, key: 'GW-2' }, { ...crit, key: 'GW-3', level: 'warn' }],
    log: [{ at: '2026-08-03T10:00:00+07:00', key: 'GW-2', code: 'html-urgent' }],
    nowMs: NOW,
    config: on,
  });
  assert.deepEqual(r.sent.map((a) => a.key), ['GW-1']);
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd console && node --test server/lib/notify.test.mjs`
Expected: FAIL — thiếu `./notify.js`.

- [ ] **Step 3: Viết `console/server/lib/notify.js`**

```js
const { execFile } = require('child_process');

/**
 * Nhắc mốc RA NGOÀI trang. Trước đây `onNotify` phía client chỉ chạy khi trang đang mở và mất
 * focus → đóng tab là im, mà mốc HTML thì không đợi ai mở tab.
 *
 * `shouldNotify` là hàm THUẦN để test được; phần chạm hệ điều hành gói riêng trong
 * `sendNotification` và là best-effort (không phải macOS / bị chặn quyền thì bỏ qua).
 */
const REPEAT_MS = 12 * 3600e3;

function shouldNotify(alert, log, nowMs, config = {}) {
  if (config.notify === false) return false;
  if (alert.level !== 'crit') return false;
  const last = (log || [])
    .filter((r) => r && r.key === alert.key && r.code === alert.code)
    .map((r) => Date.parse(r.at))
    .sort((a, b) => b - a)[0];
  return !last || nowMs - last >= REPEAT_MS;
}

function notifyNewCrits({ alerts = [], log = [], nowMs, config = {} }) {
  return { sent: alerts.filter((a) => shouldNotify(a, log, nowMs, config)) };
}

function sendNotification(title, message) {
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
  execFile('osascript', ['-e', script], (err) => {
    if (err) console.log('notify: bỏ qua (' + err.message + ')');
  });
}

module.exports = { shouldNotify, notifyNewCrits, sendNotification, REPEAT_MS };
```

- [ ] **Step 4: Chạy test — xanh**

Run: `cd console && node --test server/lib/notify.test.mjs`
Expected: `pass 6 · fail 0`.

- [ ] **Step 5: Cắm vòng soi 60s vào server**

`console/server/lib/paths.js`: thêm vào `file`: `notified: path.join(AGENT_AUTO, 'history', 'notified.jsonl'),`

`console/config.json`: thêm `"notify": true,` (cạnh `gitAuthor`).

`console/server/index.js`, sau khi listen thành công:

```js
    // Nhắc mốc ngay cả khi không ai mở trang — 60s/lần, cùng nhịp với /api/alerts
    setInterval(() => {
      try {
        const state = readJSON(file.state, { issues: {} });
        const alerts = buildAlerts(state, todayStr(), readActivityMap());
        const log = readJSONL(file.notified);
        const { sent } = notifyNewCrits({ alerts, log, nowMs: Date.now(), config: readJSON(file.config, {}) });
        for (const a of sent) {
          sendNotification('Daily Console — ' + a.key, a.text);
          appendJSONL(file.notified, { at: new Date().toISOString(), key: a.key, code: a.code });
        }
      } catch (e) {
        console.log('notify loop: ' + e.message); // không được làm sập server
      }
    }, 60000);
```

Import những gì cần ở đầu file theo đúng tên đang có trong `lib/fsutil`, `lib/alerts`, `lib/backup`, `lib/activity`. Nếu `lib/activity` không phơi hàm lấy map cho mọi ticket thì truyền `{}` — cảnh báo "đứng yên" sẽ không nhắc, các cảnh báo mốc vẫn đủ.

- [ ] **Step 6: Kiểm bằng cảnh báo giả**

```bash
cd /Users/lap17727/VNG/agent-auto/console && node -e '
const { sendNotification } = require("./server/lib/notify");
sendNotification("Daily Console — test", "nếu thấy dòng này thì đường nhắc đã sống");'
```
Expected: notification hiện ở góc phải màn hình macOS. Nếu không thấy, kiểm quyền Notifications cho Terminal/iTerm rồi báo user — **không** hack quanh.

- [ ] **Step 7: Đề xuất commit (HỎI USER)** — nhắc restart server.

```bash
git add console config.json && git commit -m "$(cat <<'EOF'
[agent-auto] Send OS notifications for new critical deadline alerts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Dự báo ngày xong

**Files:**
- Create: `console/server/lib/forecast.js`, `console/server/lib/forecast.test.mjs`
- Modify: `console/server/routes/learn.js` (trả thêm `forecast` per ticket), `console/src/panels/todayPanel.js` (dòng phụ ở cột Mốc kế), `console/src/styles/table.css`

**Interfaces:**
- Consumes: `leadTimes()` từ `server/lib/learn.js` (đã có: `{ phases: [{phase, medianHours, samples}], open: { [key]: {phase, since, hours} } }`).
- Produces: `forecast({ phase, elapsedHours, leadByPhase, todayISO, minSamples })` → `{ date, samples }` hoặc `null`.

- [ ] **Step 1: Viết test trước**

Tạo `console/server/lib/forecast.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { forecast } from './forecast.js';

const lead = { coding: { medianHours: 72, samples: 5 }, deliver: { medianHours: 10, samples: 2 } };
const TODAY = '2026-08-03';

test('đủ mẫu → dự báo = hôm nay + số ngày còn lại', () => {
  const r = forecast({ phase: 'coding', elapsedHours: 24, leadByPhase: lead, todayISO: TODAY });
  assert.deepEqual(r, { date: '2026-08-05', samples: 5 }); // còn 48h = 2 ngày
});

test('dưới 3 mẫu → null, KHÔNG bịa số', () => {
  assert.equal(forecast({ phase: 'deliver', elapsedHours: 1, leadByPhase: lead, todayISO: TODAY }), null);
});

test('phase không có mẫu nào → null', () => {
  assert.equal(forecast({ phase: 'bugfix', elapsedHours: 1, leadByPhase: lead, todayISO: TODAY }), null);
});

test('đã quá median → dự báo là hôm nay, không phải ngày âm', () => {
  const r = forecast({ phase: 'coding', elapsedHours: 200, leadByPhase: lead, todayISO: TODAY });
  assert.equal(r.date, TODAY);
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd console && node --test server/lib/forecast.test.mjs`
Expected: FAIL — thiếu `./forecast.js`.

- [ ] **Step 3: Viết `console/server/lib/forecast.js`**

```js
/**
 * Dự báo ngày xong phase hiện tại từ lead time THẬT (history/phases.jsonl).
 *
 * Giữ đúng luật "không bịa" đã có trong vòng học: dưới `minSamples` mẫu thì trả null để UI in
 * "chưa đủ dữ liệu" — dự báo sai còn tệ hơn không dự báo, vì nó làm hoãn đúng việc gấp.
 */
const DAY_MS = 864e5;

function forecast({ phase, elapsedHours = 0, leadByPhase = {}, todayISO, minSamples = 3 }) {
  const lead = leadByPhase[phase];
  if (!lead || !lead.samples || lead.samples < minSamples) return null;
  const remainHours = Math.max(0, lead.medianHours - elapsedHours);
  const date = new Date(new Date(todayISO + 'T00:00:00').getTime() + Math.ceil(remainHours / 24) * DAY_MS);
  return { date: date.toISOString().slice(0, 10), samples: lead.samples };
}

module.exports = { forecast };
```

- [ ] **Step 4: Chạy test — xanh**

Run: `cd console && node --test server/lib/forecast.test.mjs`
Expected: `pass 4 · fail 0`.

- [ ] **Step 5: Trả dự báo qua API**

Trong `console/server/routes/learn.js`, sau khi có `leadTimes()`, thêm vào response:

```js
  const leadByPhase = Object.fromEntries(phases.map((p) => [p.phase, { medianHours: p.medianHours, samples: p.samples }]));
  const forecasts = Object.fromEntries(
    Object.entries(open).map(([key, cur]) => [
      key,
      forecast({ phase: cur.phase, elapsedHours: cur.hours, leadByPhase, todayISO: todayStr() }),
    ])
  );
```

và thêm `forecasts` vào object `res.json({...})`. Tên field trong `phases` phải khớp cái `learn.js` đang trả (đọc file rồi dùng đúng tên, đừng đoán).

- [ ] **Step 6: Hiện dòng phụ ở cột Mốc kế**

`console/src/panels/todayPanel.js`: nạp `api.learn()` cùng nhịp activity (30s), giữ `forecastMap`, rồi trong `taskRow`, sau `dueText`:

```js
  // Dự báo chỉ có nghĩa khi việc còn trong tay mình và có mốc để so
  const fc = forecastMap[key];
  const fcHtml =
    fc && next
      ? `<span class="fc${fc.date > next.date ? ' late' : ''}" title="Dự báo từ lead time thật, ${fc.samples} mẫu">dự báo ${shortDate(fc.date)}</span>`
      : '';
```

Chèn `${fcHtml}` vào trong ô `c-due` ngay sau `<span class="due">…</span>`.

`console/src/styles/table.css`: thêm

```css
/* Dòng phụ dự báo: nhỏ + xám, không được tranh sự chú ý với mốc thật */
.c-due .fc { display: block; font-size: var(--fs-xs); color: var(--muted); }
.c-due .fc.late { color: var(--crit); }
```

- [ ] **Step 7: Cổng chốt + xem thật**

Run: `cd console && npm run check`
Expected: xanh hết. Refresh trang: ticket `coding` nào có ≥3 mẫu lead time thì hiện `dự báo …`; chưa đủ mẫu thì không hiện gì (đúng luật).

- [ ] **Step 8: Đề xuất commit (HỎI USER)** — nhắc restart server.

```bash
git add console && git commit -m "$(cat <<'EOF'
[agent-auto] Forecast finish date from measured phase lead times

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Gọn `SKILL.md` + mode `/daily doctor` + cập nhật README

**Files:**
- Create: `~/.claude/skills/daily/references/jql.md`, `references/sharepoint.md`, `references/nexus.md`
- Modify: `~/.claude/skills/daily/SKILL.md`, `README.md`, `console/README.md`

**Interfaces:**
- Consumes: `schema/vocab.json`, `tools/state-doctor.mjs`.
- Produces: `SKILL.md` ngắn hơn, bảng phase thay bằng con trỏ tới vocab; mode mới `/daily doctor`.

- [ ] **Step 1: Tách 3 file tra cứu**

Đọc `SKILL.md`, chuyển nguyên văn (cắt–dán, **không viết lại**) sang:
- `references/jql.md` — công thức JQL, cách gọi connector Atlassian, cách xử lý key rớt khỏi query.
- `references/sharepoint.md` — cách dò/tải design, `download.aspx?SourceUrl=`, Graph listing, các cách KHÔNG ăn.
- `references/nexus.md` — cách đọc ticket nexus, bóc mốc, đọc comment.

Trong `SKILL.md`, chỗ vừa cắt để lại 1 dòng trỏ: `Chi tiết: references/jql.md`.

- [ ] **Step 2: Bảng phase → con trỏ vocab**

Thay bảng phase trong `SKILL.md` bằng:

```markdown
## Vòng đời task (PHASE)

Vốn từ phase · loại mốc · trạng thái design là **`AGENT_AUTO/schema/vocab.json`** — nguồn duy nhất,
console đọc chính file đó. Ghi `state.issues[key].phase` bằng đúng `id` trong file.
KHÔNG tự đặt tên phase mới: `state-doctor` sẽ báo ERROR (E1) và console gom vào nhóm
"Phase lạ — console chưa khai báo".

Dây chuyền thường: `waiting-design → ready → coding → deliver (chỉ task có kênh promotion)
→ wait-test → bugfix → done-fe`. Hai phase rẽ nhánh: `reassigned` (đổi assignee — còn nợ bàn giao,
xem mục handoff) và `closed` (Done thật).
```

- [ ] **Step 3: Thêm mode `/daily doctor`**

Trong mục Mode của `SKILL.md`:

```markdown
- `doctor` → chạy `node tools/state-doctor.mjs`, TỰ SỬA cái sửa được (ngày sai định dạng nếu suy
  được từ ticket, key ghi chú đặt sai chỗ) rồi chạy lại để chứng minh sạch; cái không tự sửa được
  thì báo user kèm mã luật. KHÔNG quét Jira, KHÔNG code.
```

- [ ] **Step 4: Cập nhật 2 README**

`README.md`: bảng cấu trúc thêm 2 dòng — `schema/vocab.json` (nguồn vốn từ) và `tools/state-doctor.mjs` (validator). Mục "Console ghi 3 chỗ" → **4 chỗ** (thêm `tasks/<KEY>/handoff.md`). Thêm `/daily doctor` vào danh sách lệnh.

`console/README.md`: mục "Thêm tính năng ở đâu" — dòng "Phase mới của vòng đời" đổi thành `schema/vocab.json` (kèm ngoại lệ icon mới vẫn phải khai trong `core/icons.js`). Thêm `npm run check` vào mục Chạy. Bảng cấu trúc thêm `lib/vocab.js`, `lib/delta.js`, `lib/notify.js`, `lib/forecast.js`, `routes/doctor.js`, `routes/delta.js`, `routes/handoff.js`, `src/core/grouping.mjs`, `src/core/marks.mjs`.

- [ ] **Step 5: Cổng chốt lần cuối**

Run: `cd console && npm run check`
Expected: xanh toàn bộ.

- [ ] **Step 6: Nghiệm thu tiêu chí "một chỗ" của spec**

Thêm tạm 1 phase giả vào `schema/vocab.json` dùng icon đã có:

```json
    { "id": "thu-nghiem", "label": "thử nghiệm", "icon": "dot", "sev": "wait", "group": "Thử nghiệm", "htmlTodo": true }
```

Run: `cd console && npm run build`, refresh trang, đổi tạm 1 ticket sang phase đó **trên bản copy state ở `/tmp`** rồi `node tools/state-doctor.mjs --root /tmp/<copy>`.
Expected: không sửa file nào khác mà bảng/timeline/dải mốc đã hiểu phase mới; doctor không báo E1. Sau đó **xoá phase giả** và chạy lại `npm run check`.

- [ ] **Step 7: Đề xuất commit (HỎI USER)**

```bash
git add README.md console/README.md schema/vocab.json && git commit -m "$(cat <<'EOF'
[agent-auto] Point the daily skill at shared vocabulary and add doctor mode

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

(`SKILL.md` và `references/` nằm ở `~/.claude/skills/daily/` — ngoài repo này, không vào commit.)

---

## Self-review

**Spec coverage:** §3.1 vocab → Task 1-2 · §3.2 doctor → Task 4-5 · §3.3 tách todayPanel → Task 3 · §3.4 test client (8 ca bắt buộc) → Task 3 (phase lạ · đếm = số dòng · offMyPlate ngoài timeline/dải mốc · dim · isLate · duedate/mustDeliver · key `_` · nhãn chồng) + Task 1 (dải mốc phía server) · §3.5 lint + check → Task 6 · §3.6 git → Task 0 · §4.1 dashboard → Task 7 · §4.2 delta → Task 8 · §4.3 handoff → Task 9 · §4.4 notify → Task 10 · §4.5 forecast → Task 11 · §4.6 skill gọn → Task 12. Không còn mục nào của spec thiếu task.

**Sai lệch so với spec, đã cố ý:** spec §4.2 kể `type: bugsheet`, nhưng `history/issues.jsonl` không mang field `bugSheets` nên không thể suy ra — plan bỏ loại đó, giữ `status · phase · milestone · duedate`. Spec §3.1 thiếu cờ `lateExempt`, plan thêm vào vocab để **giữ nguyên hành vi cũ** của `isLate` (phase `deliver` không được miễn trễ mốc). Cả 2 chỗ cần sửa lại spec cho khớp.

**Type consistency:** `runDoctor({root, skipIcons})` → `{at, errors, warns}` dùng thống nhất ở Task 4-5 · `groupTasks(issues, {filterText, expanded})` → `{groups, trackedTotal, trackedMatched, orphanCount}` dùng ở Task 3 · `layoutMarks(milestones, {pctOf, daysUntilOf, keyIds, minGapPct})` ở Task 3 · `buildDelta({issueRows, phaseRows, sinceISO})` ở Task 8 · `shouldNotify(alert, log, nowMs, config)` / `notifyNewCrits({alerts, log, nowMs, config})` ở Task 10 · `forecast({phase, elapsedHours, leadByPhase, todayISO, minSamples})` ở Task 11. Không có tên hàm nào lệch giữa các task.
