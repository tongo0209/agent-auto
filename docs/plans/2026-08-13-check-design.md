# Skill `/check-design` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng skill `/check-design <KEY>` soát design đã giao có ĐỦ so với yêu cầu chưa — báo THIẾU đúng cái nguồn đòi, soạn sẵn text gửi PM, ghi bằng chứng có mốc thời gian vào `agent-auto`.

**Architecture:** Phần *phán đoán* (đọc brief/docx/Jira, nhìn ảnh, đọc cây layer PSD) do model làm theo luật trong `SKILL.md`. Phần *máy móc và dễ sai khi tự giác* (ép bằng chứng, tách hai rổ, tính DELTA theo ngày, ghi state/brief) do script `gap-store.mjs` cưỡng chế — model nộp JSON, script mới là nơi quyết định con số cuối. Ảnh dài cắt lát bằng `img-slice.py` trước khi đọc.

**Tech Stack:** Node 25 (ESM, `node:test`, không dependency ngoài) · Python 3 + Pillow (đã có sẵn theo `psd-tools`) · `agent-auto/tools/psd-tree.py` (có sẵn) · `skills/daily/scripts/sp-coverage.mjs` (có sẵn) · MCP Atlassian cho Jira.

## Global Constraints

- Ngôn ngữ giao tiếp với user: **tiếng Việt** (luật global).
- **KHÔNG** `git commit` / `git push` tự động — hỏi user từng lần (luật global). Các step "Commit" dưới đây phải hỏi trước khi chạy.
- **KHÔNG** ghi ngược Jira. **KHÔNG** tự đổi `state.issues[KEY].phase`.
- **KHÔNG** thêm dependency mới: chỉ Node built-in + Pillow/psd-tools sẵn có.
- `node tools/state-doctor.mjs` phải exit 0 sau mọi thay đổi state.
- Mọi verdict `THIẾU` phải truy được ra câu nguồn đòi nó (`item.source.quote`) — không có nguồn thì không phải THIẾU.
- Đường dẫn gốc: `AGENT_AUTO = /Users/lap17727/VNG/agent-auto`.
- Enum verdict, viết đúng chữ có dấu: `ĐỦ` · `THIẾU` · `CHƯA-CHẮC` · `KHÔNG-ÁP-DỤNG`.

## File Structure

| File | Trách nhiệm |
|---|---|
| `agent-auto/skills/check-design/SKILL.md` | Luật + luồng 5 bước cho model. Bản chính, nạp mỗi lần chạy. |
| `agent-auto/skills/check-design/references/ask-checklist.md` | Rổ 2 — checklist câu hỏi theo loại task. Chỉ sinh câu hỏi, không sinh THIẾU. |
| `agent-auto/skills/check-design/references/output-format.md` | Mẫu bảng terminal, block gửi PM, schema JSON model phải nộp. |
| `agent-auto/skills/check-design/scripts/gap-store.mjs` | Cưỡng chế 2 luật + lưu trữ + DELTA + ghi state/brief + render `.md`. |
| `agent-auto/skills/check-design/scripts/gap-store.test.mjs` | Test cho trên (`node --test`). |
| `agent-auto/skills/check-design/scripts/img-slice.py` | Cắt ảnh dài thành lát đọc được, trả mapping y về tọa độ gốc. |
| `agent-auto/skills/check-design/scripts/img-slice.test.py` | Test cho trên (`unittest`). |
| `agent-auto/tools/state-doctor.mjs` (sửa) | Thêm luật E9 (định dạng `design.gaps`) + W6 (đang code mà design còn thiếu). |
| `agent-auto/tools/state-doctor.test.mjs` (sửa) | Test cho E9 + W6. |
| `~/.claude/skills/check-design` | Symlink → `agent-auto/skills/check-design`. |
| `~/.claude/skills/daily/SKILL.md` (sửa) | Móc gọi `/check-design` ở `prep` và cổng `ready → coding`. |

---

### Task 1: `gap-store.mjs` — cưỡng chế hai luật + lưu run đầu

Đây là trái tim. Model nộp JSON thô; script quyết định con số cuối, nên hai luật quan trọng nhất
(bằng chứng, hai rổ) không phụ thuộc vào sự tự giác của model.

**Files:**
- Create: `agent-auto/skills/check-design/scripts/gap-store.mjs`
- Test: `agent-auto/skills/check-design/scripts/gap-store.test.mjs`

**Interfaces:**
- Consumes: không có (task đầu).
- Produces:
  - `export function normalize(run)` → `{items, asks, counts}`. Cưỡng chế 2 luật, KHÔNG đụng đĩa.
  - `export function applyRun({root, key, run, now})` → `{gapFile, runIndex, delta, counts}`. Ghi đĩa.
  - `export function computeDelta(prevRun, curRun, now)` → `{resolved[], stillMissing[{id,label,days}], fresh[]}`.
  - Kiểu `run` đầu vào:
    ```jsonc
    { "key":"GW-713", "depth":"deep"|"fast",
      "files": {"downloaded":6,"missingSource":1,"newerAtSource":0,"note":"..."},
      "items": [{"id":"frame4-popup","label":"...","kind":"màn",
                 "source":{"from":"docx","ref":"note_dev_landing.docx","quote":"..."},
                 "milestone":"html","verdict":"THIẾU",
                 "evidence":{"looked":["a.jpg"],"found":null,"blockedBy":null}}],
      "asks": [{"id":"share-image","label":"Ảnh share mạng xã hội","why":"nguồn không nói"}] }
    ```

- [ ] **Step 1: Viết test thất bại cho hai luật cưỡng chế**

Tạo `agent-auto/skills/check-design/scripts/gap-store.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { normalize } from './gap-store.mjs';

const item = (over = {}) => ({
  id: 'frame4-popup',
  label: 'Popup content frame 4',
  kind: 'màn',
  source: { from: 'docx', ref: 'note_dev_landing.docx', quote: 'mỗi menu mở popup content' },
  verdict: 'THIẾU',
  evidence: { looked: ['SUBWEB-VLTT_PC.jpg', 'SUBWEB VLTT_PC.psb (layer tree)'], found: null, blockedBy: null },
  ...over,
});

test('THIẾU mà chưa soi PSD nào thì bị hạ xuống CHƯA-CHẮC', () => {
  const { items } = normalize({ key: 'GW-1', items: [item({ evidence: { looked: ['a.jpg'], found: null, blockedBy: null } })] });
  assert.equal(items[0].verdict, 'CHƯA-CHẮC');
  assert.match(items[0].evidence.blockedBy, /chưa soi PSD/);
});

test('THIẾU mà không soi gì cả cũng bị hạ xuống CHƯA-CHẮC', () => {
  const { items } = normalize({ key: 'GW-1', items: [item({ evidence: { looked: [], found: null, blockedBy: null } })] });
  assert.equal(items[0].verdict, 'CHƯA-CHẮC');
});

test('THIẾU có soi cả ảnh lẫn PSD thì giữ nguyên', () => {
  const { items } = normalize({ key: 'GW-1', items: [item()] });
  assert.equal(items[0].verdict, 'THIẾU');
});

test('item không có nguồn đòi thì không được là THIẾU — chuyển sang rổ hỏi', () => {
  const { items, asks } = normalize({ key: 'GW-1', items: [item({ id: 'mobile', source: null })] });
  assert.equal(items.length, 0);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].id, 'mobile');
  assert.match(asks[0].why, /nguồn không/);
});

test('ĐỦ phải có found, không có thì hạ xuống CHƯA-CHẮC', () => {
  const { items } = normalize({
    key: 'GW-1',
    items: [item({ verdict: 'ĐỦ', evidence: { looked: ['a.jpg'], found: null, blockedBy: null } })],
  });
  assert.equal(items[0].verdict, 'CHƯA-CHẮC');
});

test('counts đếm đúng 4 mức + rổ hỏi', () => {
  const { counts } = normalize({
    key: 'GW-1',
    items: [
      item(),
      item({ id: 'a', verdict: 'ĐỦ', evidence: { looked: ['a.jpg'], found: 'a.jpg y≈100', blockedBy: null } }),
      item({ id: 'b', verdict: 'CHƯA-CHẮC', evidence: { looked: ['a.jpg'], found: null, blockedBy: 'PSB chưa tải' } }),
      item({ id: 'c', verdict: 'KHÔNG-ÁP-DỤNG', evidence: { looked: [], found: null, blockedBy: null } }),
    ],
    asks: [{ id: 'share', label: 'Ảnh share', why: 'nguồn không nói' }],
  });
  assert.deepEqual(counts, { ok: 1, missing: 1, unsure: 1, na: 1, ask: 1 });
});
```

- [ ] **Step 2: Chạy test cho chắc là fail**

Run: `cd /Users/lap17727/VNG/agent-auto/skills/check-design/scripts && node --test gap-store.test.mjs`
Expected: FAIL — `Cannot find module ... gap-store.mjs`

- [ ] **Step 3: Viết `normalize` tối thiểu cho test pass**

Tạo `agent-auto/skills/check-design/scripts/gap-store.mjs`:

```javascript
#!/usr/bin/env node
/* gap-store.mjs — nơi CHỐT con số của /check-design.
 *
 * Model nộp JSON thô (nó "nhìn" design). Script này mới là chỗ quyết định verdict cuối, vì hai
 * luật dưới đây là loại luật model rất dễ tự bẻ khi thấy "hiển nhiên":
 *
 *   1. LUẬT BẰNG CHỨNG — chưa soi cây layer PSD thì không ai được nói THIẾU (ca GW-713: popup
 *      rất có thể nằm trong layer ẩn của PSB 237MB mà 3 ảnh JPG preview không thể hiện).
 *   2. LUẬT HAI RỔ — chỉ cái NGUỒN có đòi mới được gọi là thiếu; checklist của nghề chỉ được
 *      sinh câu hỏi (bài học "đủ phải đo theo nguồn, không tự định nghĩa").
 *
 * Dùng: gap-store.mjs --root <agent-auto> --key GW-713 --in run.json [--now <ISO>] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';

export const VERDICTS = ['ĐỦ', 'THIẾU', 'CHƯA-CHẮC', 'KHÔNG-ÁP-DỤNG'];
const PSD_RE = /\.(psd|psb)\b/i;

/** Cưỡng chế 2 luật + đếm. Không đụng đĩa nên test được thẳng. */
export function normalize(run) {
  const items = [];
  const asks = [...(run.asks || [])];

  for (const raw of run.items || []) {
    const it = { ...raw, evidence: { looked: [], found: null, blockedBy: null, ...(raw.evidence || {}) } };
    if (!VERDICTS.includes(it.verdict)) it.verdict = 'CHƯA-CHẮC';

    // Luật hai rổ: không có nguồn đòi ⇒ không phải thiếu, chỉ là câu hỏi cho PM.
    if (!it.source || !it.source.quote) {
      if (it.verdict === 'THIẾU' || it.verdict === 'CHƯA-CHẮC') {
        asks.push({ id: it.id, label: it.label, why: 'nguồn không đòi mục này — hỏi PM cho chắc' });
        continue;
      }
    }

    // Luật bằng chứng: THIẾU chỉ hợp lệ khi đã soi cả ảnh lẫn cây layer PSD/PSB.
    if (it.verdict === 'THIẾU') {
      const looked = it.evidence.looked || [];
      const sawPsd = looked.some((f) => PSD_RE.test(f));
      if (!looked.length || !sawPsd) {
        it.verdict = 'CHƯA-CHẮC';
        it.evidence.blockedBy = it.evidence.blockedBy
          || 'chưa soi PSD/PSB — dump cây layer (tools/psd-tree.py) rồi mới được kết luận THIẾU';
      }
    }

    // ĐỦ phải chỉ được ra chỗ thấy, không thì cũng chỉ là phỏng đoán.
    if (it.verdict === 'ĐỦ' && !it.evidence.found) {
      it.verdict = 'CHƯA-CHẮC';
      it.evidence.blockedBy = it.evidence.blockedBy || 'nói ĐỦ mà không chỉ được ra file/vùng/layer nào';
    }

    items.push(it);
  }

  const counts = {
    ok: items.filter((i) => i.verdict === 'ĐỦ').length,
    missing: items.filter((i) => i.verdict === 'THIẾU').length,
    unsure: items.filter((i) => i.verdict === 'CHƯA-CHẮC').length,
    na: items.filter((i) => i.verdict === 'KHÔNG-ÁP-DỤNG').length,
    ask: asks.length,
  };
  return { items, asks, counts };
}
```

- [ ] **Step 4: Chạy test cho pass**

Run: `cd /Users/lap17727/VNG/agent-auto/skills/check-design/scripts && node --test gap-store.test.mjs`
Expected: PASS — `pass 6 · fail 0`

- [ ] **Step 5: Commit** (hỏi user trước — luật global)

```bash
git add skills/check-design/scripts/gap-store.mjs skills/check-design/scripts/gap-store.test.mjs
git commit -m "[agent-auto] add gap-store normalize with evidence and two-basket rules"
```

---

### Task 2: DELTA theo ngày + ghi đĩa (`design-gap.json`, `state.json`, `brief.md`)

**Files:**
- Modify: `agent-auto/skills/check-design/scripts/gap-store.mjs`
- Modify: `agent-auto/skills/check-design/scripts/gap-store.test.mjs`

**Interfaces:**
- Consumes: `normalize(run)` từ Task 1.
- Produces:
  - `computeDelta(prevRun, curRun, now)` → `{resolved:[{id,label}], stillMissing:[{id,label,days,firstSeenMissing}], fresh:[{id,label}]}`
  - `applyRun({root, key, run, now})` → `{gapFile:'…/design-gap.json', mdFile:'…/design-gap.md', counts, delta, items, asks}`
  - Cấu trúc `tasks/<KEY>/design-gap.json`: `{key, runs: [{checkedAt, depth, files, counts, items, asks, delta}]}` — giữ tối đa 10 run gần nhất.
  - `state.issues[KEY].design.gaps = {checkedAt, depth, counts, missingTop: string[≤3]}`

- [ ] **Step 1: Viết test thất bại cho DELTA và ghi đĩa**

Thêm vào cuối `gap-store.test.mjs`:

```javascript
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyRun, computeDelta } from './gap-store.mjs';

/** agent-auto giả: chỉ cần state.json + tasks/<KEY>/brief.md. */
function fixture(brief = '# GW-1\n\n## Việc còn mở\n\n- [ ] việc người viết tay\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gap-'));
  fs.writeFileSync(
    path.join(root, 'state.json'),
    JSON.stringify({ schemaVersion: 2, issues: { 'GW-1': { phase: 'ready', design: { status: 'đã-giao-đã-tải' } } } }, null, 2)
  );
  fs.mkdirSync(path.join(root, 'tasks/GW-1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tasks/GW-1/brief.md'), brief);
  return root;
}

const missingItem = {
  id: 'frame4-popup', label: 'Popup content frame 4', kind: 'màn',
  source: { from: 'docx', ref: 'note.docx', quote: 'mỗi menu mở popup content' },
  verdict: 'THIẾU',
  evidence: { looked: ['pc.jpg', 'pc.psb (layer tree)'], found: null, blockedBy: null },
};

test('run đầu: ghi design-gap.json, đánh dấu firstSeenMissing = hôm nay', () => {
  const root = fixture();
  const r = applyRun({ root, key: 'GW-1', run: { key: 'GW-1', depth: 'deep', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  const saved = JSON.parse(fs.readFileSync(r.gapFile, 'utf8'));
  assert.equal(saved.runs.length, 1);
  assert.equal(saved.runs[0].items[0].firstSeenMissing, '2026-08-13');
  assert.equal(r.counts.missing, 1);
});

test('run sau: item vẫn thiếu thì giữ firstSeenMissing và đếm số ngày', () => {
  const root = fixture();
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  const r2 = applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-15T10:00:00+07:00' });
  assert.equal(r2.delta.stillMissing.length, 1);
  assert.equal(r2.delta.stillMissing[0].days, 2);
  assert.equal(r2.delta.stillMissing[0].firstSeenMissing, '2026-08-13');
});

test('run sau: item đã có design thì vào rổ resolved', () => {
  const root = fixture();
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  const fixed = { ...missingItem, verdict: 'ĐỦ', evidence: { looked: ['pc.jpg'], found: 'pc.jpg y≈2400', blockedBy: null } };
  const r2 = applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [fixed] }, now: '2026-08-15T10:00:00+07:00' });
  assert.deepEqual(r2.delta.resolved.map((x) => x.id), ['frame4-popup']);
  assert.equal(r2.delta.stillMissing.length, 0);
});

test('ghi state.issues[KEY].design.gaps mà không đụng design.status', () => {
  const root = fixture();
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', depth: 'deep', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  const st = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8'));
  assert.equal(st.issues['GW-1'].design.status, 'đã-giao-đã-tải');
  assert.equal(st.issues['GW-1'].design.gaps.counts.missing, 1);
  assert.deepEqual(st.issues['GW-1'].design.gaps.missingTop, ['Popup content frame 4']);
  assert.equal(st.issues['GW-1'].design.gaps.checkedAt, '2026-08-13T10:00:00+07:00');
});

test('vá brief giữa marker, chạy 2 lần không nhân đôi và không nuốt dòng người viết', () => {
  const root = fixture();
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-15T10:00:00+07:00' });
  const brief = fs.readFileSync(path.join(root, 'tasks/GW-1/brief.md'), 'utf8');
  assert.equal(brief.match(/<!-- check-design:begin -->/g).length, 1);
  assert.match(brief, /việc người viết tay/);
  assert.match(brief, /Popup content frame 4/);
});

test('brief không có mục "Việc còn mở" thì thêm mục mới ở cuối', () => {
  const root = fixture('# GW-1\n\nnội dung\n');
  applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: '2026-08-13T10:00:00+07:00' });
  const brief = fs.readFileSync(path.join(root, 'tasks/GW-1/brief.md'), 'utf8');
  assert.match(brief, /## Việc còn mở/);
  assert.match(brief, /<!-- check-design:begin -->/);
});

test('chỉ giữ 10 run gần nhất', () => {
  const root = fixture();
  for (let d = 1; d <= 12; d++) {
    applyRun({ root, key: 'GW-1', run: { key: 'GW-1', items: [missingItem] }, now: `2026-08-${String(d).padStart(2, '0')}T10:00:00+07:00` });
  }
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'tasks/GW-1/design-gap.json'), 'utf8'));
  assert.equal(saved.runs.length, 10);
  assert.equal(saved.runs[0].checkedAt.slice(0, 10), '2026-08-03');
});
```

- [ ] **Step 2: Chạy test cho chắc là fail**

Run: `cd /Users/lap17727/VNG/agent-auto/skills/check-design/scripts && node --test gap-store.test.mjs`
Expected: FAIL — `applyRun is not a function` / `computeDelta is not a function`

- [ ] **Step 3: Viết `computeDelta` + `applyRun`**

Thêm vào `gap-store.mjs` (sau `normalize`):

```javascript
const MISSINGISH = new Set(['THIẾU', 'CHƯA-CHẮC']);
const dayOf = (iso) => String(iso).slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** Gắn firstSeenMissing cho item hiện tại, thừa kế từ run trước nếu vẫn đang thiếu. */
function carryFirstSeen(prevItems, items, today) {
  const prev = new Map((prevItems || []).map((i) => [i.id, i]));
  for (const it of items) {
    if (!MISSINGISH.has(it.verdict)) { delete it.firstSeenMissing; continue; }
    const p = prev.get(it.id);
    it.firstSeenMissing = p && MISSINGISH.has(p.verdict) && p.firstSeenMissing ? p.firstSeenMissing : today;
  }
  return items;
}

export function computeDelta(prevRun, curRun, now) {
  const today = dayOf(now);
  const prev = new Map((prevRun?.items || []).map((i) => [i.id, i]));
  const resolved = [];
  const stillMissing = [];
  const fresh = [];

  for (const it of curRun.items) {
    const p = prev.get(it.id);
    if (MISSINGISH.has(it.verdict)) {
      if (!p || !MISSINGISH.has(p.verdict)) fresh.push({ id: it.id, label: it.label });
      else stillMissing.push({
        id: it.id, label: it.label,
        firstSeenMissing: it.firstSeenMissing,
        days: daysBetween(it.firstSeenMissing, today),
      });
    }
  }
  for (const [id, p] of prev) {
    if (!MISSINGISH.has(p.verdict)) continue;
    const c = curRun.items.find((i) => i.id === id);
    if (c && !MISSINGISH.has(c.verdict)) resolved.push({ id, label: p.label });
  }
  return { resolved, stillMissing, fresh };
}

const BEGIN = '<!-- check-design:begin -->';
const END = '<!-- check-design:end -->';

function briefBlock(items, asks, now) {
  const lines = [BEGIN, `<!-- soát design ${dayOf(now)} — khối này do /check-design quản, sửa tay sẽ bị ghi đè -->`];
  const missing = items.filter((i) => i.verdict === 'THIẾU');
  const unsure = items.filter((i) => i.verdict === 'CHƯA-CHẮC');
  for (const i of missing) lines.push(`- [ ] ❌ THIẾU design: **${i.label}** — nguồn đòi: "${i.source?.quote || ''}" (${i.source?.ref || ''})`);
  for (const i of unsure) lines.push(`- [ ] ❓ CHƯA CHẮC: **${i.label}** — ${i.evidence?.blockedBy || 'cần soi thêm'}`);
  for (const a of asks) lines.push(`- [ ] 💬 Hỏi PM: **${a.label}** — ${a.why}`);
  if (lines.length === 2) lines.push('- ✅ Soát design: không thiếu gì so với nguồn.');
  lines.push(END);
  return lines.join('\n');
}

function patchBrief(briefPath, block) {
  if (!fs.existsSync(briefPath)) return false;
  let txt = fs.readFileSync(briefPath, 'utf8');
  if (txt.includes(BEGIN) && txt.includes(END)) {
    txt = txt.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), block);
  } else if (/^## Việc còn mở\s*$/m.test(txt)) {
    txt = txt.replace(/^## Việc còn mở\s*$/m, (m) => `${m}\n\n${block}`);
  } else {
    txt = `${txt.replace(/\s*$/, '')}\n\n## Việc còn mở\n\n${block}\n`;
  }
  fs.writeFileSync(briefPath, txt);
  return true;
}

function renderMd(key, entry) {
  const L = [`# ${key} — soát design ${entry.checkedAt}`, ''];
  const c = entry.counts;
  L.push(`**ĐỦ ${c.ok} · THIẾU ${c.missing} · CHƯA CHẮC ${c.unsure} · hỏi thêm ${c.ask}**`, '');
  if (entry.files) L.push(`Tầng file: đã tải ${entry.files.downloaded} · nguồn còn thiếu ${entry.files.missingSource} · nguồn mới hơn bản local ${entry.files.newerAtSource}`, '');
  L.push('| Mức | Hạng mục | Nguồn đòi | Bằng chứng |', '|---|---|---|---|');
  for (const i of entry.items) {
    L.push(`| ${i.verdict} | ${i.label} | ${i.source ? `"${i.source.quote}" (${i.source.ref})` : '—'} | ${i.evidence?.found || i.evidence?.blockedBy || `đã soi: ${(i.evidence?.looked || []).join(', ') || '—'}`} |`);
  }
  if (entry.asks.length) {
    L.push('', '## Nguồn không nói — nên hỏi PM', '');
    for (const a of entry.asks) L.push(`- **${a.label}** — ${a.why}`);
  }
  const d = entry.delta;
  if (d && (d.resolved.length || d.stillMissing.length || d.fresh.length)) {
    L.push('', '## So với lần soát trước', '');
    for (const x of d.resolved) L.push(`- ✅ đã có: ${x.label}`);
    for (const x of d.stillMissing) L.push(`- ⏳ vẫn thiếu sang ngày thứ ${x.days}: ${x.label} (thiếu từ ${x.firstSeenMissing})`);
    for (const x of d.fresh) L.push(`- 🆕 mới phát sinh: ${x.label}`);
  }
  return `${L.join('\n')}\n`;
}

export function applyRun({ root, key, run, now }) {
  const today = dayOf(now);
  const { items, asks, counts } = normalize(run);
  const taskDir = path.join(root, 'tasks', key);
  fs.mkdirSync(taskDir, { recursive: true });
  const gapFile = path.join(taskDir, 'design-gap.json');

  const store = fs.existsSync(gapFile) ? JSON.parse(fs.readFileSync(gapFile, 'utf8')) : { key, runs: [] };
  const prevRun = store.runs[store.runs.length - 1] || null;
  carryFirstSeen(prevRun?.items, items, today);

  const entry = { checkedAt: now, depth: run.depth || 'deep', files: run.files || null, counts, items, asks };
  entry.delta = computeDelta(prevRun, entry, now);
  store.runs.push(entry);
  store.runs = store.runs.slice(-10);
  fs.writeFileSync(gapFile, `${JSON.stringify(store, null, 2)}\n`);

  const mdFile = path.join(taskDir, 'design-gap.md');
  fs.writeFileSync(mdFile, renderMd(key, entry));

  const statePath = path.join(root, 'state.json');
  if (fs.existsSync(statePath)) {
    const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const issue = (st.issues[key] = st.issues[key] || {});
    issue.design = issue.design || {};
    issue.design.gaps = {
      checkedAt: now,
      depth: entry.depth,
      counts,
      missingTop: items.filter((i) => i.verdict === 'THIẾU').slice(0, 3).map((i) => i.label),
    };
    fs.writeFileSync(statePath, `${JSON.stringify(st, null, 2)}\n`);
  }

  patchBrief(path.join(taskDir, 'brief.md'), briefBlock(items, asks, now));
  return { gapFile, mdFile, counts, delta: entry.delta, items, asks };
}

/* ─────────── CLI ─────────── */
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const get = (f, d = '') => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
  const root = get('--root', '/Users/lap17727/VNG/agent-auto');
  const key = get('--key');
  const inFile = get('--in');
  const now = get('--now', new Date().toISOString());
  if (!key || !inFile) {
    console.error('Usage: gap-store.mjs --root <agent-auto> --key <GW-123> --in <run.json> [--now <ISO>] [--json]');
    process.exit(2);
  }
  const run = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const res = applyRun({ root, key, run, now });
  if (argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else {
    const c = res.counts;
    console.log(`${key}: ĐỦ ${c.ok} · THIẾU ${c.missing} · CHƯA CHẮC ${c.unsure} · hỏi thêm ${c.ask}`);
    console.log(`→ ${res.mdFile}`);
  }
  process.exit(res.counts.missing > 0 ? 1 : 0);
}
```

- [ ] **Step 4: Chạy toàn bộ test cho pass**

Run: `cd /Users/lap17727/VNG/agent-auto/skills/check-design/scripts && node --test gap-store.test.mjs`
Expected: PASS — `fail 0` (13 test)

- [ ] **Step 5: Chạy thử CLI trên fixture tạm để chắc CLI không vỡ**

```bash
cd /Users/lap17727/VNG/agent-auto
TMP=$(mktemp -d) && mkdir -p "$TMP/tasks/GW-0" && echo '{"schemaVersion":2,"issues":{}}' > "$TMP/state.json"
cat > "$TMP/run.json" <<'JSON'
{"key":"GW-0","depth":"fast","items":[{"id":"x","label":"Bản mobile","kind":"biến-thể",
 "source":{"from":"brief","ref":"brief.md","quote":"cần bản mobile 768"},"verdict":"THIẾU",
 "evidence":{"looked":["pc.jpg","pc.psb (layer tree)"],"found":null,"blockedBy":null}}]}
JSON
node skills/check-design/scripts/gap-store.mjs --root "$TMP" --key GW-0 --in "$TMP/run.json" --now 2026-08-13T10:00:00+07:00; echo "exit=$?"
cat "$TMP/tasks/GW-0/design-gap.md"
```

Expected: in `GW-0: ĐỦ 0 · THIẾU 1 · CHƯA CHẮC 0 · hỏi thêm 0`, `exit=1`, và file `.md` có bảng.

- [ ] **Step 6: Commit** (hỏi user trước)

```bash
git add skills/check-design/scripts/gap-store.mjs skills/check-design/scripts/gap-store.test.mjs
git commit -m "[agent-auto] add gap-store delta tracking and state/brief writeback"
```

---

### Task 3: `img-slice.py` — cắt ảnh dài để đọc được và truy ngược tọa độ

**Files:**
- Create: `agent-auto/skills/check-design/scripts/img-slice.py`
- Test: `agent-auto/skills/check-design/scripts/img-slice.test.py`

**Interfaces:**
- Consumes: không.
- Produces: CLI `img-slice.py <ảnh> [--outdir DIR] [--max-width 900] [--slice-h 1400] [--overlap 100] [--json]`
  → in JSON `{"src","scale","slices":[{"file","yTop","yBottom","yTopSrc","yBottomSrc"}]}`.
  `yTopSrc/yBottomSrc` là tọa độ trên ảnh GỐC — dùng để ghi `evidence.found` kiểu `"pc.jpg y≈2400–3100"`.

- [ ] **Step 1: Viết test thất bại**

Tạo `agent-auto/skills/check-design/scripts/img-slice.test.py`:

```python
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
SCRIPT = HERE / "img-slice.py"


def run(img, *args):
    out = subprocess.run(
        [sys.executable, str(SCRIPT), str(img), "--json", *args],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


class TestImgSlice(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.img = Path(self.tmp) / "pc.jpg"
        Image.new("RGB", (2000, 5300), "white").save(self.img)

    def test_cat_anh_dai_thanh_nhieu_lat(self):
        res = run(self.img, "--outdir", self.tmp)
        self.assertGreater(len(res["slices"]), 1)
        for s in res["slices"]:
            self.assertTrue(Path(s["file"]).exists())
            self.assertLessEqual(Image.open(s["file"]).width, 900)

    def test_lat_truy_nguoc_dung_toa_do_anh_goc(self):
        res = run(self.img, "--outdir", self.tmp)
        self.assertEqual(res["slices"][0]["yTopSrc"], 0)
        # lát cuối phải phủ tới đáy ảnh gốc (cho sai số làm tròn 2px)
        self.assertGreaterEqual(res["slices"][-1]["yBottomSrc"], 5300 - 2)
        # các lát phải chồng lấn, không được hở
        for a, b in zip(res["slices"], res["slices"][1:]):
            self.assertLess(b["yTopSrc"], a["yBottomSrc"])

    def test_anh_ngan_thi_khong_cat(self):
        short = Path(self.tmp) / "short.jpg"
        Image.new("RGB", (800, 600), "white").save(short)
        res = run(short, "--outdir", self.tmp)
        self.assertEqual(len(res["slices"]), 1)
        self.assertEqual(res["slices"][0]["yTopSrc"], 0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy test cho chắc là fail**

Run: `cd /Users/lap17727/VNG/agent-auto/skills/check-design/scripts && python3 img-slice.test.py`
Expected: FAIL — `FileNotFoundError` / `can't open file 'img-slice.py'`

- [ ] **Step 3: Viết `img-slice.py`**

```python
#!/usr/bin/env python3
"""Cắt ảnh design dài thành lát đọc được, giữ đường về tọa độ ảnh GỐC.

Vì sao: design landing hay là ảnh 2000×5300. Đọc thẳng vừa tốn context vừa mất nét chi tiết
(nút, popup, chữ nhỏ) — mà chi tiết mới là thứ /check-design cần nhìn. Cắt lát + hạ bề rộng
xong vẫn phải truy ngược được "cái này nằm ở y≈2400 của ảnh gốc" để ghi bằng chứng.

Dùng: img-slice.py <ảnh> [--outdir DIR] [--max-width 900] [--slice-h 1400] [--overlap 100] [--json]
"""
import argparse
import json
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # design PC dài 5000px+ vượt ngưỡng cảnh báo mặc định


def slice_image(src: Path, outdir: Path, max_width: int, slice_h: int, overlap: int):
    img = Image.open(src)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    w, h = img.size
    scale = min(1.0, max_width / w)
    if scale < 1.0:
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    W, H = img.size

    outdir.mkdir(parents=True, exist_ok=True)
    stem = src.stem.replace(" ", "-")
    slices, top, idx = [], 0, 1
    step = max(1, slice_h - overlap)
    while True:
        bottom = min(top + slice_h, H)
        out = outdir / f"{stem}-{idx:02d}.jpg"
        img.crop((0, top, W, bottom)).save(out, "JPEG", quality=82)
        slices.append({
            "file": str(out),
            "yTop": top, "yBottom": bottom,
            "yTopSrc": round(top / scale), "yBottomSrc": round(bottom / scale),
        })
        if bottom >= H:
            break
        top += step
        idx += 1
    return {"src": str(src), "size": [w, h], "scale": round(scale, 4), "slices": slices}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--outdir", default=None)
    ap.add_argument("--max-width", type=int, default=900)
    ap.add_argument("--slice-h", type=int, default=1400)
    ap.add_argument("--overlap", type=int, default=100)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    src = Path(a.image)
    outdir = Path(a.outdir) if a.outdir else src.parent / "_slices"
    res = slice_image(src, outdir, a.max_width, a.slice_h, a.overlap)
    if a.json:
        print(json.dumps(res, ensure_ascii=False))
    else:
        print(f"{src.name}: {res['size'][0]}x{res['size'][1]} → {len(res['slices'])} lát trong {outdir}")
        for s in res["slices"]:
            print(f"  {Path(s['file']).name}  y gốc {s['yTopSrc']}–{s['yBottomSrc']}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Chạy test cho pass**

Run: `cd /Users/lap17727/VNG/agent-auto/skills/check-design/scripts && python3 img-slice.test.py`
Expected: PASS — `Ran 3 tests ... OK`

- [ ] **Step 5: Chạy thật trên design GW-713 để chắc chịu được ảnh 2000×5300**

Run:
```bash
cd /Users/lap17727/VNG/agent-auto
python3 skills/check-design/scripts/img-slice.py "designs/GW-713/SUBWEB-VLTT_PC.jpg" --outdir /tmp/gw713-slices
```
Expected: in `2000x5300 → 4 lát`, các file tồn tại trong `/tmp/gw713-slices`.

- [ ] **Step 6: Commit** (hỏi user trước)

```bash
git add skills/check-design/scripts/img-slice.py skills/check-design/scripts/img-slice.test.py
git commit -m "[agent-auto] add img-slice for reading long design images"
```

---

### Task 4: `state-doctor` biết field `design.gaps` (E9 + W6)

Field mới không được trôi nổi không ai validate — `state-doctor` là nơi giữ hợp đồng của `state.json`.

**Files:**
- Modify: `agent-auto/tools/state-doctor.mjs` (chèn sau khối luật E8, quanh dòng 133)
- Modify: `agent-auto/tools/state-doctor.test.mjs`

**Interfaces:**
- Consumes: `state.issues[KEY].design.gaps` do `applyRun` (Task 2) ghi.
- Produces: luật `E9` (định dạng sai) và `W6` (đang code mà design còn thiếu). Không đổi chữ ký `runDoctor`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `agent-auto/tools/state-doctor.test.mjs`:

```javascript
test('E9: design.gaps thiếu checkedAt hoặc counts sai kiểu', () => {
  const root = fixture({
    issues: { 'GW-1': { phase: 'ready', design: { status: 'đã-giao-đã-tải', gaps: { counts: { missing: 'nhiều' } } } } },
  });
  const res = runDoctor(root, { skipIcons: true });
  const codes = res.problems.map((p) => p.code);
  assert.ok(codes.includes('E9'), `mong có E9, thực tế: ${codes.join(',')}`);
});

test('W6: đang code mà design còn thiếu thì cảnh báo', () => {
  const root = fixture({
    issues: {
      'GW-1': {
        phase: 'coding',
        paths: [{ repo: 'cdn-source', path: '.' }],
        design: {
          status: 'đã-giao-đã-tải',
          gaps: { checkedAt: '2026-08-13T10:00:00+07:00', counts: { ok: 1, missing: 2, unsure: 0, na: 0, ask: 0 }, missingTop: ['Popup frame 4'] },
        },
      },
    },
  });
  const res = runDoctor(root, { skipIcons: true });
  const w6 = res.problems.find((p) => p.code === 'W6');
  assert.ok(w6, 'mong có W6');
  assert.match(w6.msg, /2 hạng mục/);
});

test('design.gaps hợp lệ và không thiếu gì thì im lặng', () => {
  const root = fixture({
    issues: {
      'GW-1': {
        phase: 'ready',
        design: {
          status: 'đã-giao-đã-tải',
          gaps: { checkedAt: '2026-08-13T10:00:00+07:00', counts: { ok: 3, missing: 0, unsure: 0, na: 0, ask: 1 }, missingTop: [] },
        },
      },
    },
  });
  const codes = runDoctor(root, { skipIcons: true }).problems.map((p) => p.code);
  assert.ok(!codes.includes('E9') && !codes.includes('W6'), `mong im lặng, thực tế: ${codes.join(',')}`);
});
```

- [ ] **Step 2: Chạy test cho chắc là fail**

Run: `cd /Users/lap17727/VNG/agent-auto && node --test tools/state-doctor.test.mjs`
Expected: FAIL — 2 test mới báo `mong có E9` / `mong có W6`

- [ ] **Step 3: Thêm luật vào `state-doctor.mjs`**

Chèn ngay sau khối E8 (sau dòng đóng của `if (designDelivered && ...) { ... }`):

```javascript
    // E9: `design.gaps` do /check-design ghi — field nào cũng phải có người canh, nếu không
    // console và báo cáo sẽ đọc phải số rác mà không ai biết.
    const gaps = issue.design?.gaps;
    if (gaps) {
      if (!ISO_DATETIME.test(String(gaps.checkedAt || ''))) {
        err('E9', key, `design.gaps.checkedAt = "${gaps.checkedAt}" không phải thời điểm ISO`);
      }
      for (const n of ['ok', 'missing', 'unsure', 'na', 'ask']) {
        const v = gaps.counts?.[n];
        if (v !== undefined && typeof v !== 'number') {
          err('E9', key, `design.gaps.counts.${n} = "${v}" không phải số`);
        }
      }
      // W6: đang code trong khi design còn thiếu — không chặn (user có quyền dựng phần đủ
      // trước), nhưng phải nói ra để không dựng nhầm rồi đập đi.
      if (activePhaseIds.has(issue.phase) && Number(gaps.counts?.missing) > 0) {
        warn('W6', key, `đang "${issue.phase}" mà design còn thiếu ${gaps.counts.missing} hạng mục`
          + (gaps.missingTop?.length ? `: ${gaps.missingTop.join(' · ')}` : ''));
      }
    }
```

Nếu `ISO_DATETIME` chưa tồn tại trong file, thêm cạnh chỗ khai `ISO_DATE`:

```javascript
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
```

- [ ] **Step 4: Chạy test cho pass và chạy doctor trên state thật**

Run: `cd /Users/lap17727/VNG/agent-auto && node --test tools/state-doctor.test.mjs && node tools/state-doctor.mjs; echo "exit=$?"`
Expected: test `fail 0`; doctor trên state thật `exit=0` (chưa ticket nào có `gaps` nên không phát sinh lỗi mới)

- [ ] **Step 5: Commit** (hỏi user trước)

```bash
git add tools/state-doctor.mjs tools/state-doctor.test.mjs
git commit -m "[agent-auto] state-doctor validates design.gaps (E9) and warns coding with gaps (W6)"
```

---

### Task 5: `SKILL.md` + references + symlink — phần model đọc

**Files:**
- Create: `agent-auto/skills/check-design/SKILL.md`
- Create: `agent-auto/skills/check-design/references/ask-checklist.md`
- Create: `agent-auto/skills/check-design/references/output-format.md`
- Create: symlink `~/.claude/skills/check-design`

**Interfaces:**
- Consumes: `gap-store.mjs` (CLI `--root --key --in --now`), `img-slice.py`, `tools/psd-tree.py`, `skills/daily/scripts/sp-coverage.mjs`.
- Produces: lệnh `/check-design <KEY> [--fast|--ask]` cho user và cho `/daily` gọi qua tool Skill.

- [ ] **Step 1: Viết `SKILL.md`**

Nội dung bắt buộc có, theo đúng spec:

- Frontmatter `name: check-design` + `description` nêu rõ: soát design đã giao có đủ so với yêu cầu chưa, 3 tầng (file · màn · trạng thái), dùng khi user gõ `/check-design` hoặc hỏi "design đủ chưa / thiếu gì".
- Đường dẫn cố định (`AGENT_AUTO`, `designs/<KEY>/`, `tasks/<KEY>/`).
- **Luồng 5 bước** (Bước 1 dựng danh sách yêu cầu — thứ tự nguồn `brief.md` → note PM trong `designs/<KEY>/` → Jira description+comment, nguồn chi tiết/mới hơn thắng **và phải sửa ngược `brief.md`**; Bước 2 kiểm kê tầng file bằng `sp-coverage.mjs`; Bước 3 đối chiếu nông sau khi `img-slice.py`; Bước 4 soi sâu bằng `psd-tree.py` chỉ cho item chưa `ĐỦ`; Bước 5 nộp JSON cho `gap-store.mjs`).
- **Hai luật cứng** (bằng chứng · hai rổ) kèm câu: *script `gap-store.mjs` sẽ tự hạ mức nếu bạn khai THIẾU mà chưa soi PSD — đừng cố lách, hãy đi soi.*
- Ngưỡng đẩy subagent: > 6 item cần soi sâu **hoặc** tổng ảnh > 50MB → một subagent cho một nhóm màn, nhận về JSON `items[]`.
- Cấm: đổi `phase`, commit/push, ghi Jira, đoán khi không tải được design (Canva/Figma → `CHƯA-CHẮC` + 📎).
- Cờ `--fast` (bỏ bước 4) và `--ask` (chỉ in lại block gửi PM từ `design-gap.json`).
- Không truyền KEY → soát mọi ticket `state.json` đang ở phase `waiting-design`/`ready`.

- [ ] **Step 2: Viết `references/ask-checklist.md`**

Checklist rổ 2, mở đầu bằng cảnh báo in đậm: **những mục dưới đây KHÔNG BAO GIỜ được ghi là THIẾU — chỉ được thành câu hỏi cho PM.** Nhóm theo loại task:

- Mọi task: bản mobile (768) ↔ PC (1920), trạng thái hover/active/disabled của nút và menu, popup nội dung, trạng thái rỗng/lỗi/hết hạn, ảnh share mạng xã hội + meta description, favicon, font (đã có file font chưa hay chỉ có ảnh).
- Landing promotion (`pm__`): popup thể lệ, popup đăng nhập, popup xác nhận, popup thành công/thất bại, form nhập, trạng thái hết quà.
- Subweb/mainsite: header/footer, menu nhiều cấp, trang con, phân trang, bảng xếp hạng.

- [ ] **Step 3: Viết `references/output-format.md`**

Chứa: schema JSON model phải nộp (đúng như "Interfaces" Task 1), mẫu bảng terminal, và **mẫu block copy gửi PM** dạng:

```
Chào anh/chị, em soát lại design cho <KEY> ngày <ngày>, còn mấy mục cần anh/chị bổ sung ạ:
1. <label> — em cần cho <màn>, vì <ref> có ghi "<quote>". (liên quan mốc <milestone> <ngày>)
...
Mấy mục sau nguồn không nhắc, anh/chị xác nhận giúp em có cần không ạ: <asks>
```

- [ ] **Step 4: Tạo symlink và kiểm skill được nhận**

```bash
ln -s /Users/lap17727/VNG/agent-auto/skills/check-design /Users/lap17727/.claude/skills/check-design
ls -l /Users/lap17727/.claude/skills/check-design
head -3 /Users/lap17727/.claude/skills/check-design/SKILL.md
```
Expected: symlink trỏ đúng, đọc được frontmatter `name: check-design`.

- [ ] **Step 5: Commit** (hỏi user trước)

```bash
git add skills/check-design/SKILL.md skills/check-design/references
git commit -m "[agent-auto] add check-design skill instructions and references"
```

---

### Task 6: Kiểm chứng end-to-end trên 2 ticket có đáp án

Không được claim skill chạy được khi chưa chạy trên ca thật.

**Files:**
- Modify (do skill tự ghi): `agent-auto/tasks/GW-713/design-gap.{md,json}`, `agent-auto/tasks/GW-525/design-gap.{md,json}`, `state.json`, `brief.md` của 2 ticket.

**Interfaces:**
- Consumes: toàn bộ Task 1–5.
- Produces: bằng chứng chạy thật để báo cáo user.

- [ ] **Step 1: Chạy `/check-design GW-713`**

Đáp án cần bắt được: **popup content của menu frame 2 và frame 4** — `note_dev_landing.docx` đòi ("mỗi menu mở popup content"), 3 ảnh JPG preview không thể hiện. Đáp án thực tế lịch sử: user phải tự code popup ngày 4/8 (commit `d080ccc08` "sửa frame2/frame4 + popup base").

Kỳ vọng: mục này ra `THIẾU` (nếu đã dump được cây layer PSB) hoặc `CHƯA-CHẮC` kèm `blockedBy` nói rõ cần soi PSB nào. **Không được** ra `ĐỦ`.

- [ ] **Step 2: Kiểm mọi mục THIẾU đều truy được ra nguồn**

Run: `cd /Users/lap17727/VNG/agent-auto && python3 -c "
import json;d=json.load(open('tasks/GW-713/design-gap.json'));r=d['runs'][-1]
bad=[i['id'] for i in r['items'] if i['verdict']=='THIẾU' and not (i.get('source') or {}).get('quote')]
print('THIẾU không nguồn:', bad); assert not bad"`
Expected: `THIẾU không nguồn: []`, không AssertionError.

- [ ] **Step 3: Chạy `/check-design GW-525` và đối chiếu 3 việc treo đã biết**

3 việc treo đã ghi: mây vật cản · giờ 06:00 vs 10:00 · câu VN Frame7. Việc nào bản chất là **thiếu design** thì phải xuất hiện trong báo cáo; việc nào là câu hỏi nghiệp vụ thì được phép nằm ở rổ hỏi. Ghi lại kết quả đối chiếu vào phần báo cáo cho user.

- [ ] **Step 4: Chạy DELTA — chạy lại GW-713 lần 2**

Run: `/check-design GW-713` lần nữa (cùng dữ liệu).
Expected: `design-gap.json` có 2 run; `delta.stillMissing[].days` = 0 (cùng ngày); brief chỉ có **một** khối `check-design:begin`.

- [ ] **Step 5: Doctor phải sạch**

Run: `cd /Users/lap17727/VNG/agent-auto && node tools/state-doctor.mjs; echo "exit=$?"`
Expected: `exit=0`, không có E9.

- [ ] **Step 6: Commit** (hỏi user trước)

```bash
git add tasks/GW-713 tasks/GW-525 state.json
git commit -m "[agent-auto] record first check-design runs for GW-713 and GW-525"
```

---

### Task 7: Móc `/check-design` vào `/daily`

**Files:**
- Modify: `~/.claude/skills/daily/SKILL.md` (mục `prep` quanh dòng 72, và mục kế hoạch/cổng giao việc quanh dòng 199–203)

**Interfaces:**
- Consumes: skill `check-design` (Task 5), field `state.issues[KEY].design.gaps` (Task 2).
- Produces: 2 điểm gọi; không chép logic sang `daily`.

- [ ] **Step 1: Thêm gọi ở `prep`**

Thêm vào mô tả mode `prep <KEY>` (dòng ~72):

```markdown
- `prep <KEY>` → chỉ Bước 2 cho ticket đó (brief + dò design), không code. **Tải design xong
  thì gọi `/check-design <KEY>`** (skill riêng) để soát design có đủ so với yêu cầu chưa —
  kết quả nằm ở `tasks/<KEY>/design-gap.md`, tóm tắt ở `state.issues[KEY].design.gaps`.
  KHÔNG chép luật soát vào file này.
```

- [ ] **Step 2: Thêm cổng cảnh báo trước khi giao việc code**

Thêm vào mục đường ray giao việc (quanh dòng 199–203):

```markdown
- **Trước khi giao `/code-developer`**: đọc `state.issues[KEY].design.gaps`. Chưa soát lần nào
  (không có `gaps`) → chạy `/check-design <KEY>` trước. Có `gaps.counts.missing > 0` → ghi 1
  dòng ⚠ trong bảng duyệt kế hoạch: "design còn thiếu N hạng mục: <missingTop>" và đề xuất
  dựng phần đủ trước. **Cảnh báo, KHÔNG chặn** — quyền quyết vẫn của user.
```

- [ ] **Step 3: Kiểm không phá `daily`**

Run: `cd /Users/lap17727/.claude/skills/daily && wc -l SKILL.md && grep -n "check-design" SKILL.md`
Expected: file tăng ~10 dòng, grep ra đúng 2 chỗ.

- [ ] **Step 4: Commit** (hỏi user trước — `~/.claude/skills/daily` là thư mục thật, kiểm xem có git riêng không trước khi commit)

---

## Self-Review

**1. Spec coverage** — đối chiếu từng mục spec với task:

| Yêu cầu spec | Task |
|---|---|
| 4 mức verdict + bằng chứng bắt buộc | 1 |
| Luật hai rổ | 1 |
| Luật "không tin cái không thấy" | 1 |
| Đơn vị requirement item + schema | 1 (Interfaces), 5 (`output-format.md`) |
| Bước 1 dựng danh sách yêu cầu, nguồn mới thắng, sửa ngược brief | 5 (SKILL.md) |
| Bước 2 tầng file (`sp-coverage`) | 5 (SKILL.md), hiển thị ở `renderMd` Task 2 |
| Bước 3 đối chiếu nông + cắt ảnh | 3, 5 |
| Bước 4 soi sâu `psd-tree.py` + ngưỡng subagent | 5 |
| Bước 5 xuất + ghi ngược (md/json/state/brief) | 2 |
| DELTA giữa các lần chạy | 2 |
| Block copy gửi PM | 5 (`output-format.md`), render trong `design-gap.md` Task 2 |
| Thứ tự dựng (code được ngay / phải chờ) | 5 (SKILL.md, mục đầu ra) |
| Giao diện lệnh `--fast` / `--ask` / không KEY | 5 |
| Không đổi phase, không commit, không ghi Jira | Global Constraints, 5 |
| `state-doctor` exit 0 + biết field mới | 4 |
| Kiểm chứng GW-713 + GW-525 | 6 |
| Móc vào `/daily` 2 chỗ | 7 |

Không còn mục nào của spec chưa có task.

**2. Placeholder scan** — không có "TBD"/"tương tự task N"; mọi step có code hoặc lệnh thật kèm output kỳ vọng. Task 5 mô tả nội dung tài liệu theo đề mục bắt buộc thay vì chép nguyên văn — chấp nhận được vì đó là văn bản hướng dẫn cho model, không phải code có hợp đồng kiểu.

**3. Type consistency** — `normalize()` / `applyRun()` / `computeDelta()` dùng thống nhất giữa Task 1, 2, 4, 6. Tên field `counts.{ok,missing,unsure,na,ask}`, `evidence.{looked,found,blockedBy}`, `source.{from,ref,quote}`, `design.gaps.{checkedAt,depth,counts,missingTop}` khớp nhau ở mọi chỗ xuất hiện (test Task 2, luật E9/W6 Task 4, móc `daily` Task 7).
