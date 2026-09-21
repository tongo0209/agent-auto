import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fixboard from './fixboard.js';

const { scanFixBoards, annotateOpenBugs, parseBoard } = fixboard;

const SHEET_ID = '1P9iE5oLzUZmPdWwlLTiSRbBpb8642mG3o64C3Ut3iP8';
const REGISTRY = {
  '2026-trung-thu': { sheetUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=0` },
  'bomber-convert': { sheetUrl: 'https://vngms.sharepoint.com/:x:/s/QM/IQAk_CPANIjRTLYEiI4MlEP1' },
};

/* Bản SAO NGẮN của board thật: 2026-trung-thu-2026-09-17.md (khối `### #42`) và
   2026-trung-thu-2026-09-07.md (khối `- **#3**`) — 2 shape khác nhau trong cùng registry */
const BOARD_HEADING_SHAPE = `# Bug board — 2026-trung-thu · 2026-09-17 (delta: bug 41, 42)
<!-- sheet-map: header_row=11; bugid_col=A; status_col=I; notes_col=J -->

## FIX

### #42 (SheetRow 52) — Thay tên event (VN/ENG/TH) · visual-asset
- **Nơi đã sửa:** assets/Frame1/images/maintext-vn.png
- **Verdict:** PASS
- **Ghi-sheet:** pending

### #41 (SheetRow 51) — Update 3 câu random text EN
- **Verdict:** PASS
- **Ghi-sheet:** done

## Ghi chú
- không phải bug entry
`;

const BOARD_BULLET_SHAPE = `<!-- sheet-map: header_row=11; bugid_col=A; status_col=I -->
## 2. FIX

- **#3** Bấm "Redo" vẫn bị tính mất lượt — Device: PC,Mobile — SheetRow: 15 — lane 1
  - Nơi đã sửa: _state.js:312 (commit d0e2bead4)
  - Ghi-sheet: pending

- **#5** Text "Redo" không căn giữa — SheetRow: 17 — lane 4
  - Ghi-sheet: pending

## 3. BÁO (không fix — kèm bằng chứng)

- **#4** Ô dòng code phải đem lên chỗ text đỏ — ↪ backend — SheetRow: 16
  - Ghi-sheet: skip
`;

const BOARD_BROKEN = `chỉ là ghi chú rời, không có heading FIX, không có #id
- linh tinh
`;

function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixboard-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

const scan = (root, registry = REGISTRY) => scanFixBoards({ repos: { r: root }, registry });

test('board shape heading: lấy bug đã fix + sheetRow + trạng thái ghi-sheet', () => {
  const root = makeRepo({
    '.claude/bugs-lite/2026-trung-thu-2026-09-17.md': BOARD_HEADING_SHAPE,
  });
  const out = scan(root);
  const bugs = out.bySheet[SHEET_ID];

  assert.deepEqual(Object.keys(bugs).sort(), ['41', '42']);
  assert.equal(bugs['42'].sheetRow, 52);
  assert.equal(bugs['42'].verdict, 'PASS');
  assert.equal(bugs['42'].sheetWritten, 'pending');
  assert.equal(bugs['41'].sheetWritten, 'done');
  assert.equal(bugs['42'].fixedAt, '2026-09-17');
  assert.match(bugs['42'].board, /2026-trung-thu-2026-09-17\.md$/);
});

test('board shape bullet: chỉ lấy mục FIX, bỏ mục BÁO; bắt commit trong thân mục', () => {
  const root = makeRepo({
    'products/lan/landing/2026-trung-thu/.claude/bugs-lite/2026-trung-thu-2026-09-07.md': BOARD_BULLET_SHAPE,
  });
  const bugs = scan(root).bySheet[SHEET_ID];

  assert.deepEqual(Object.keys(bugs).sort(), ['3', '5']);
  assert.equal(bugs['3'].commit, 'd0e2bead4');
  assert.equal(bugs['5'].commit, null);
  assert.equal(bugs['3'].sheetRow, 15);
});

test('board hỏng định dạng: không ném lỗi, đếm vào skipped', () => {
  const root = makeRepo({
    '.claude/bugs-lite/2026-trung-thu-2026-09-17.md': BOARD_HEADING_SHAPE,
    '.claude/bugs-lite/2026-trung-thu-2026-09-18--lane1-triage.md': BOARD_BROKEN,
  });
  const out = scan(root);

  assert.equal(out.skipped, 1);
  assert.equal(out.boards, 2);
  assert.equal(Object.keys(out.bySheet[SHEET_ID]).length, 2);
});

test('không có sheet-map trong board: suy sheetId qua slug ↔ registry', () => {
  const root = makeRepo({ '.claude/bugs-lite/2026-trung-thu-2026-09-17.md': BOARD_HEADING_SHAPE });
  assert.ok(scan(root).bySheet[SHEET_ID], 'slug 2026-trung-thu phải ra sheetId của registry');
});

test('slug không suy được sheetId: vào unmapped kèm lý do, không đoán bừa', () => {
  const root = makeRepo({
    '.claude/bugs-lite/bomber-convert-2026-09-21.md': BOARD_HEADING_SHAPE,
    '.claude/bugs-lite/du-an-la-2026-09-21.md': BOARD_HEADING_SHAPE,
  });
  const out = scan(root);

  assert.deepEqual(out.bySheet, {});
  assert.deepEqual(
    out.unmapped.map((u) => [u.slug, u.reason]).sort(),
    [
      ['bomber-convert', 'sheet-url-khong-phai-google'],
      ['du-an-la', 'slug-khong-co-trong-registry'],
    ],
  );
  assert.equal(out.unmapped[0].bugs, 2);
});

test('bugId trùng ở 2 board khác ngày: lấy bản mới hơn', () => {
  const root = makeRepo({
    '.claude/bugs-lite/2026-trung-thu-2026-09-07.md': BOARD_BULLET_SHAPE,
    '.claude/bugs-lite/2026-trung-thu-2026-09-17.md': BOARD_BULLET_SHAPE.replace('Ghi-sheet: pending', 'Ghi-sheet: done'),
  });
  const bug3 = scan(root).bySheet[SHEET_ID]['3'];

  assert.equal(bug3.fixedAt, '2026-09-17');
  assert.equal(bug3.sheetWritten, 'done');
});

test('annotateOpenBugs: 3 trạng thái chua-fix · da-fix-chua-ghi-sheet · da-ghi-sheet', () => {
  const root = makeRepo({ '.claude/bugs-lite/2026-trung-thu-2026-09-17.md': BOARD_HEADING_SHAPE });
  const boardBugs = scan(root).bySheet[SHEET_ID];
  const rows = annotateOpenBugs(
    [{ bugId: '42' }, { bugId: '41' }, { bugId: '7' }],
    boardBugs,
  );

  assert.deepEqual(rows.map((r) => r.fixState), ['da-fix-chua-ghi-sheet', 'da-ghi-sheet', 'chua-fix']);
  assert.equal(rows[0].fix.commit, null);
  assert.equal(rows[2].fix, null);
});

test('bugId dạng #R31 và #SheetRow13 khớp được với bugId của sheet', () => {
  const entries = parseBoard(`## 2. FIX
- **#R31** Bỏ dòng "Thành Chủ đã nhận quà" — ĐÃ SỬA napmoc.html.twig:2 — Ghi-sheet: pending
- **#SheetRow13** Số lượng item sai — SheetRow: 13
  - Ghi-sheet: pending
`).map((e) => e.bugId);

  assert.deepEqual(entries.sort(), ['13', 'r31']);
});

test('repo/thư mục không tồn tại: trả rỗng, không ném', () => {
  const out = scanFixBoards({ repos: { mất: '/khong/co/duong/nay' }, registry: REGISTRY });
  assert.deepEqual(out, { bySheet: {}, unmapped: [], boards: 0, skipped: 0 });
});

test('shape heading có nhãn worksheet (`### PC#3 — … · SheetRow 22`)', () => {
  const [entry] = parseBoard(`## 2. FIX
### PC#3 — Popup điểm danh thiếu dấu Đ · SheetRow 22
- Verify: dist/diemdanh*.html → "Điểm Danh" ✅ PASS
`);
  assert.equal(entry.bugId, '3');
  assert.equal(entry.worksheet, 'PC');
  assert.equal(entry.sheetRow, 22);
});

test('shape bảng: mỗi hàng 1 bug, ghi-sheet chốt một lần dưới bảng', () => {
  const rows = parseBoard(`## 2. FIX (8/8 — tất cả PASS verify)

| # (SheetRow) | Bug | Nơi đã sửa | Verdict |
|---|---|---|---|
| R15 | 2 nút tròn globe+nhạc | 8 PNG sprite | **PASS** |
| R22 (BugID 14) | text đè hình | Frame3.scss:223 | **PASS** |

Ghi-sheet cả 8 bug: **done** — ghi \`Done\` vào cột I.

## 3. BÁO (không fix) — trống
| R30 | không được tính là fix | — | — |
`);
  assert.deepEqual(rows.map((r) => [r.bugId, r.sheetRow, r.verdict, r.sheetWritten]), [
    ['r15', null, 'PASS', 'done'],
    ['r22', 14, 'PASS', 'done'],
  ]);
});
