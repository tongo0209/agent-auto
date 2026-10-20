# Luật 6 kit (rút thăm phía FE) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pm-gate` có mã `PG-DRAW` soát khối `prodTemplate` trên trang có `pm__rut` (chỉ `mainsite/`, không `Promotion/`), và luật trong `rules/` khớp luật 6 của kit.

**Architecture:** Module mới `tools/pm-gate/draw.mjs` đọc HTML thô (vì `scan.mjs` làm trống ruột `<script>`), đánh giá khối `prodTemplate` bằng `node:vm`, trả finding. `runChecks` gọi nó; `pm-gate.mjs` quyết 🔴/🟡 như các mã khác. Luật chỉ sửa văn bản.

**Tech Stack:** Node ESM (`node:vm`), test runner tự viết `tools/pm-gate.test.mjs` (mảng `CASES`, chạy `node tools/pm-gate.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-20-kit-luat6-fe-draw-design.md`

## Global Constraints

- Code theo `rules/code-style.md` R-CS-1..7: comment 1 dòng, chỉ 3 loại; không phòng thủ thừa; tên thay comment.
- Không sửa kit (`~/VNG/git-vng/gt-promotion-template/standard-html-templates/`), không sửa landing đã bàn giao, không soát/sửa thư mục `Promotion/`.
- Commit repo này: `[<leaf-folder>] <English subject>` + 2 dòng footer `Co-Authored-By`/`Claude-Session`. Dùng `git add -- <paths> && git commit --only <paths>`, vì repo đang có thay đổi dở của phiên khác (`knowledge/lessons.md`, `tools/bug-radar*`, `tools/mk-handoff-html.py`, `tools/sheet-cache.mjs`, `rules/pm-kit-overrides.tsv` 2 dòng GW-909, `tools/bug-sheet-tick.py`).
- `rules/pm-kit-overrides.tsv` đang có 2 dòng chưa commit của GW-909 → **không commit file này**. Chỉ sửa, rồi báo user là file đó gộp chung thay đổi dở.
- Không push.

## Review Focus

1. Lib nạp **trước** khối `prodTemplate` (sai thứ tự) → 🔴. Test: case `draw-order` ở Task 1.
2. `<body>` có nhiều class (`vn MS__pc`) → lib tra `names["vn MS__pc"]` hụt → 🔴 thiếu `names[...]`. Test: case `draw-body-multi` ở Task 1.
3. Khối gọi hàm/biến ngoài (`baseURL`, `$`) khi chạy trong `vm` → không được ném lỗi chặn. Biến chưa khai thì vẫn đọc tiếp: kit dùng `typeof baseURL`, không lỗi. Gọi hàm không tồn tại → 🟡 "soát tay". Test: case `draw-vm-fail` ở Task 1.
4. Comment `BACKEND:` cách khối bởi một thẻ khác (không chỉ khoảng trắng) → tính là thiếu. Test: case `draw-backend-far` ở Task 1.
5. Trang Lucky không có `pm__rut` (chỉ đổi quà) → `PG-DRAW` im hoàn toàn. Test: case `draw-no-rut` ở Task 1, dùng `noRut` sẵn có.

---

### Task 1: Cổng `PG-DRAW`

**Files:**
- Create: `tools/pm-gate/draw.mjs`
- Modify: `tools/pm-gate/checks.mjs:44-50` (`runChecks` nhận `raw`, `file`; thêm `checkDraw` vào `CHECKS`)
- Modify: `tools/pm-gate.mjs:72-84` (`gateFile` truyền `raw`/`file`; xử lý `soft` + hạ mức `BACKEND:`)
- Modify: `rules/pm-kit-overrides.tsv` (thêm dòng `known` cho `data-item`; KHÔNG commit, xem Global Constraints)
- Test: `tools/pm-gate.test.mjs`

**Interfaces:**
- Produces: `export function checkDraw(ctx)` trong `draw.mjs`. Ctx giống các check khác (`{ els, contract, fullDocument, raw, file, add }`). Gọi `add(code, token, msg, indexes, extra)`.
- `runChecks(scan, contract, { fullDocument, hasBody, h5, elsewhere, raw = '', file = '' })`
- `ctx.add` nhận tham số thứ 5 `extra` (object), trộn vào finding. `PG-DRAW` dùng `{ soft: true }` cho dòng luôn 🟡.
- Finding thiếu comment có `token: 'BACKEND:'`. `gateFile` hạ nó về 🟡 cùng điều kiện `deferred` của `PG-REQ` (`lock.hooksAt === 'handoff' && campaignOf(file)`), nhưng **không** viết lại `msg` (câu `HANDOFF_NOTE` chỉ dành cho `PG-REQ`/`PG-REF`).
- `isWarn(f) = WARN_CODES.has(f.code) || f.soft || deferred.has(f.code) || (deferredActive && f.token === 'BACKEND:')`

**Bảng finding** (token / mức / khi):

| token | mức | khi |
|---|---|---|
| `prodTemplate` | 🔴 | không có `<script>` nào khai `(var\|let\|const) prodTemplate =` |
| `prodTemplate` | 🔴 | khai trong `<script type="module">`, hoặc `vm` ném `ReferenceError` "prodTemplate is not defined" (khai không ở cấp trên cùng) |
| `prodTemplate` | 🔴 | vị trí `<script>` chứa khối > vị trí `<script src=…libraryMainsite-…js>` đầu tiên |
| `prodTemplate` | 🟡 soft | `vm` ném lỗi khác → "không đọc được — soát tay"; bỏ các dòng nội dung dưới |
| `names.en` | 🔴 | thiếu `names.en` |
| `names.<class>` | 🔴 | thiếu `names[<nguyên giá trị class của body>]` (body không class ⇒ token `names.<body không class>`) |
| `items` | 🔴 | thiếu `items.length`/`items.type`, hoặc `length` ≠ số key khác `length`/`type` |
| `spoint` | 🔴 | không phần tử nào có class `spoint` |
| `spoint` | 🟡 soft | có `spoint` nhưng không phần tử nào mang cả `pm__point` lẫn `spoint` |
| `data-item` | 🔴 | giá trị `data-item` không thuộc `Object.values(items)` (trừ `length`/`type`); `indexes` = các phần tử lệch |
| `data-item` | 🟡 soft | không có phần tử `[data-item]` nào |
| `BACKEND:` | 🔴 (hạ 🟡 xem trên) | đoạn HTML ngay trước thẻ `<script>` của khối không khớp `/<!--[\s\S]*?BACKEND:[\s\S]*?-->\s*$/` |

Điều kiện chạy (return sớm): `!fullDocument` · `contract.gameplay === 'payment'` · `/(^|\/)Promotion\//.test(file)` · không phần tử nào có class `pm__rut`.

Cách đánh giá: `vm.runInNewContext(scriptBody + '\n;globalThis.__prodTemplate = prodTemplate;', { window: {} }, { timeout: 100 })`, rồi đọc `context.__prodTemplate`. Phải gán qua `globalThis`, vì `const` cấp trên cùng không thành thuộc tính của context.

- [ ] **Step 1: Sửa fixture và thêm ca test**

Trong `pm-gate.test.mjs`:
- Khai hằng `DRAW_BLOCK`: comment `<!-- BACKEND: cấu hình rút thăm -->` + `<script>const prodTemplate = { debug: { status: true, action: 'x5' }, url: typeof baseURL !== 'undefined' ? baseURL : '', directory: '', wordNumber: 1, items: { A: 'gift-1', B: 'gift-2', length: 2, type: 'png' }, names: { en: {}, vn: { A: 'Quà 1', B: 'Quà 2' } }, fnPromotion: function () {} };</script>` + `<script src="https://cdn-mainsite-aka.vnggames.com/products/libraryMainsite/prod-source/1.3.2/dist/libraryMainsite-1.3.2.js"></script>`.
- `base(L)`:
  - `<body>` → `<body class="vn">`
  - `class="pm__point"` → `class="pm__point spoint"`
  - trước `</body>` chèn `<div class="gifts"><div data-item="gift-1"></div><div data-item="gift-2"></div></div>` + `DRAW_BLOCK`

  `base(P)` giữ nguyên. Sửa `noRut` để thay cả `class="pm__point spoint"`.
- Thêm `const drawCase = (name, text, file) => gate(L, text, file)` không cần — dùng thẳng `gate(L, …, name)`.
- Thêm vào `CASES` (mỗi dòng là một ca, điều kiện bằng helper sẵn có `red`/`onlyWarn`/`noRed`; cần thì thêm `hasFail = (code, token) => (r) => r.json.fails.some((f) => f.code === code && f.token === token)`):

| Ca | Sửa từ `base(L)` | Kỳ vọng |
|---|---|---|
| `65 draw-ok` | không sửa | `noRed` và không có warn `PG-DRAW` (ca `0 base L/P sạch` vẫn xanh) |
| `66 draw-missing` | bỏ `DRAW_BLOCK` | 🔴 `PG-DRAW prodTemplate` |
| `67 draw-module` | `<script>const prodTemplate` → `<script type="module">const prodTemplate` | 🔴 `PG-DRAW prodTemplate` |
| `68 draw-in-function` | bọc khối trong `(function(){ … })();` | 🔴 `PG-DRAW prodTemplate` |
| `69 draw-order` | đổi chỗ 2 thẻ script | 🔴 `PG-DRAW prodTemplate` |
| `70 draw-var` | `const` → `var` | `noRed` |
| `71 draw-no-en` | `en: {}, ` → `` | 🔴 `PG-DRAW names.en` |
| `72 draw-body-multi` | `<body class="vn">` → `<body class="vn MS__pc">` | 🔴 `PG-DRAW names.vn MS__pc` |
| `73 draw-length` | `length: 2` → `length: 3` | 🔴 `PG-DRAW items` |
| `74 draw-no-spoint` | `pm__point spoint` → `pm__point` | 🔴 `PG-DRAW spoint` |
| `75 draw-spoint-split` | `pm__point spoint` → `pm__point`, chèn `<span class="spoint">0</span>` trước `</body>` | `onlyWarn('PG-DRAW')` |
| `76 draw-item-mismatch` | `data-item="gift-2"` → `data-item="gift-9"` | 🔴 `PG-DRAW data-item` |
| `77 draw-no-item` | bỏ khối `<div class="gifts">…</div>` | `onlyWarn('PG-DRAW')` |
| `78 draw-vm-fail` | `fnPromotion: function () {}` → `fnPromotion: $.noop` | `onlyWarn('PG-DRAW')` |
| `79 draw-backend-far` | chèn `<div></div>` giữa comment `BACKEND:` và `<script>` | 🔴 `PG-DRAW BACKEND:` |
| `80 draw-no-rut` | `noRut(base(L))` bỏ `DRAW_BLOCK` | không có finding `PG-DRAW` nào |
| `81 draw-promotion-dir` | bỏ `DRAW_BLOCK`, ghi vào `Promotion/index.html` (`writeCase` với `name='Promotion/index.html'`, tạo thư mục con) | không có finding `PG-DRAW` nào |
| `82 draw-payment` | `base(P)` chèn `<a class="pm__rut" data-value="1"></a>` | không có finding `PG-DRAW` nào |

Ca hạ mức `BACKEND:` theo `hooks-at: handoff`: thêm `83 draw-backend-handoff`. Dựng note như `lockedByNoteCase()` nhưng `gameplay: luckydraw-gift-exchange` + `- hooks-at: handoff`, ghi `base(L)` bỏ comment `BACKEND:` vào `products/g/landing/s/index.html`. Kỳ vọng: `onlyWarn('PG-DRAW')` có warn token `BACKEND:`.

- [ ] **Step 2: Chạy test, xác nhận các ca mới đỏ**

Run: `node tools/pm-gate.test.mjs 2>&1 | tail -25`
Expected: các ca 66–69, 71–79, 83 ✗ (chưa có `PG-DRAW`); ca `0` có thể ✗ vì `data-item` báo `PG-UNKNOWN`.

- [ ] **Step 3: Thêm dòng override `data-item`**

`rules/pm-kit-overrides.tsv` thêm cuối file:
`luckydraw-gift-exchange	data-item	-	known	ô quà khớp prodTemplate.items cho hiệu ứng rút (kit AI-RULES Lucky §6, fe-draw/draw-animation.js); mainsite gt-promotion 4/62 file pm__rut — 20/10/2026	no`

- [ ] **Step 4: Viết `tools/pm-gate/draw.mjs` + nối vào `checks.mjs` và `pm-gate.mjs`**

Theo Interfaces và bảng finding. `CHECKS` thêm `checkDraw` ở cuối mảng.

- [ ] **Step 5: Chạy test, xác nhận xanh hết**

Run: `node tools/pm-gate.test.mjs 2>&1 | tail -6`
Expected: `pass=89 fail=0` (70 cũ + 19 mới).

- [ ] **Step 6: Commit (không gồm `pm-kit-overrides.tsv`)**

```bash
git add -- tools/pm-gate/draw.mjs tools/pm-gate/checks.mjs tools/pm-gate.mjs tools/pm-gate.test.mjs
git commit --only tools/pm-gate/draw.mjs tools/pm-gate/checks.mjs tools/pm-gate.mjs tools/pm-gate.test.mjs -m "[pm-gate] Add PG-DRAW: prodTemplate config required on pm__rut pages (kit rule 6)"
```

### Task 2: Đo trên file bàn giao thật

**Files:** không sửa repo. Script tạm đặt trong scratchpad.

**Interfaces:** Consumes `node tools/pm-gate.mjs <file> --gameplay luckydraw-gift-exchange --baseline none --json` (Task 1).

- [ ] **Step 1: Chạy 3 file mẫu**

Run (mỗi file):
- `~/VNG/git-vng/gt-promotion-template/454-TNTQC2/landing-sinhnhat-62857/mainsite/index.html`
- `…/62857/Promotion/index.html`
- 1 file `mainsite/` khai `const prodTemplate` (lấy file đầu tiên từ `grep -rl 'const prodTemplate' --include='*.html' ~/VNG/git-vng/gt-promotion-template/*/*/mainsite`)

Expected:
- 62857 `mainsite`: không 🔴 `PG-DRAW`.
- 62857 `Promotion`: không finding `PG-DRAW` nào.
- File `const`: không có 🔴 `PG-DRAW prodTemplate` vì lý do `const`.

- [ ] **Step 2: Phân bố trên 62 file `mainsite/` có `pm__rut`**

Chạy gate trên từng file, đếm theo `code+token` các finding `PG-DRAW`. Expected (khớp bảng spec §2, sai số do grep thô):
- `prodTemplate` thiếu ≈ 5
- `spoint` 🔴 ≈ 16
- `data-item` 🟡 ≈ 58
- `BACKEND:` 🔴 ≈ 60

Lệch lớn (ví dụ `names.<class>` đỏ > 30 file, hoặc `prodTemplate` 🟡 vm-fail > 10) → **dừng, báo user**, quay lại spec.

### Task 3: Luật

**Files:**
- Modify: `rules/pm-contract.md` (R-PM-7, R-PM-10, R-PM-11 bước 3, bảng *Mã của pm-gate*)
- Modify: `rules/landing-js.md` (R-JS-1 mục chi tiết, R-JS-2 câu `timeWait`)
- Modify: `rules/html-handoff.md` (thêm R-HO-13)
- Modify: `rules/pm-kit-overrides.tsv` (dòng `prodTemplate`; không commit)
- Modify: `docs/notes/2026-09-23-kit-vs-production.md` (2 mục: `var` vs `const`, `data-item` ngoài catalog §2)

Nội dung từng chỗ lấy nguyên từ spec §3.2–§3.4:
- R-PM-7: "5 luật bất biến" → "6 luật bất biến AI-GUIDE §3 (luật 6: `pm__rut` ⇒ `prodTemplate` + `components/fe-draw/`)".
- Bảng mã thêm dòng: ``| `PG-DRAW` | 🔴 · 🟡 | trang có `pm__rut` (trừ `Promotion/`, payment): thiếu/sai khối `prodTemplate`, `names.en`/`names.<class body>`, `items.length`, `spoint`, `data-item` lệch `items`, comment `BACKEND:` (🟡 trong cdn-source khi `hooks-at: handoff`) | R-PM-7 |``
- R-PM-10 thêm (h) theo spec §3.2.
- R-PM-11 bước 3 thêm câu bảng quà theo spec §3.4.
- R-JS-1 thêm 4 ý theo spec §3.2; R-JS-2 sửa câu `timeWait` theo spec §3.2.
- R-HO-13 nguyên văn spec §3.3 (đoạn đầu).
- TSV dòng: `*	prodTemplate	-	known	khai const hợp lệ: 55/57 mainsite gt-promotion khai const; lib 1.3.2 đọc tên trần (typeof prodTemplate) — kit đòi var chặt hơn cần, 20/10/2026	no`

- [ ] **Step 1: Sửa 5 file theo trên**
- [ ] **Step 2: Kiểm tsv vẫn parse và test vẫn xanh**

Run: `node tools/pm-gate.test.mjs 2>&1 | tail -2`
Expected: `pass=89 fail=0`

- [ ] **Step 3: Kiểm chéo mã luật**

Run: `grep -nE "PG-DRAW|R-HO-13|6 luật" rules/pm-contract.md rules/html-handoff.md rules/landing-js.md`
Expected: có `PG-DRAW` trong bảng mã của `pm-contract.md`, `R-HO-13` trong `html-handoff.md`, "6 luật" trong R-PM-7.

- [ ] **Step 4: Commit (không gồm tsv)**

```bash
git add -- rules/pm-contract.md rules/landing-js.md rules/html-handoff.md docs/notes/2026-09-23-kit-vs-production.md
git commit --only rules/pm-contract.md rules/landing-js.md rules/html-handoff.md docs/notes/2026-09-23-kit-vs-production.md -m "[rules] Absorb kit rule 6: PG-DRAW code, R-HO-13 mainsite prodTemplate, R-JS-1/2 fe-draw"
```

### Task 4: Chốt

- [ ] **Step 1:** Full suite: `for t in tools/*.test.mjs; do node "$t" >/dev/null 2>&1 || echo "FAIL $t"; done`. Expected: không có dòng `FAIL` nào khác so với trước khi bắt đầu. Trước Task 1 chạy một lần để lấy baseline.
- [ ] **Step 2:** Báo user: commit hash, `pm-kit-overrides.tsv` còn dở (2 dòng GW-909 + 2 dòng mới) chờ user commit chung, phân bố Task 2.
