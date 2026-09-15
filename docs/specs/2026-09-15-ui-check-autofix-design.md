# `/ui-check --autofix` + `landing-parity` — design

Ngày: 2026-09-15 · Nguồn: brainstorm sau khi soi AgentsRoom (agent delegation / sketch) — kết luận:
cái đáng làm không phải vỏ GUI mà là **đóng vòng bắt → sửa → đo lại** cho lỗi máy-đo-được, và
**khoá các quy ước "theo landing cũ"** thành check cơ học thay vì nhắc bằng lời.

## 1. Vấn đề

- `/ui-check` bắt được Lớp 1 (ảnh vỡ, chữ cắt, tràn ngang, 404) và Lớp 2 tầm trung nhưng chỉ
  report; người phải đọc → gọi `/code-developer fix` → build → chạy lại. 3 lệnh tay cho 1 vòng.
- Landing VNG có lợi thế riêng: `coords.json` từ `/psd-cut`·`/figma-cut` cho **toạ độ kỳ vọng
  tuyệt đối** của từng asset; R-CDN bắt px tuyệt đối, cấm `@media` tay → lệch vị trí = số học.
- User phải nhắc lặp lại "làm theo landing cũ" (i18n `language.js`, header H5, popup tràn 2 bên,
  sync gt-promotion…) — quy ước đã có trong knowledge/rules nhưng **không có cổng cơ học** nào
  đối chiếu campaign mới với campaign cũ.

## 2. Phạm vi

**Làm:** (A) `/ui-check --autofix` sửa vị trí asset theo `coords.json` + Lớp 1 như cũ; (B) tool
`landing-parity` so campaign mới với campaign tham chiếu, nối vào brief dev + CLAUDE.md.

**Không làm:** fix màu, fix `w/h` (sprite tự set — lệch size = asset cắt sai, chỉ báo), thêm
markup/`data-*`, sửa pipeline `code-developer`, sửa twig handoff, commit hộ.

## 3. Quyết định đã chốt với user

| Câu hỏi | Chốt |
|---|---|
| Fix tới tầng nào | Lớp 1 + geometry theo `coords.json`; màu/ảnh sai chỉ báo |
| Ngưỡng lệch | `> 2px` (design px) |
| Kích hoạt | Chỉ khi gọi `/ui-check --autofix` |
| Map coords ↔ DOM | **A** selector trước (`.MS__sprite-<tên>` → grep SCSS `sprite($tên)` → `<img class>` → `img[src*="/tên."]` → `url(file)`), **B** template-match chỉ cho asset lẻ không map được (≤5) |
| Popup | Đo được ngay v1 nhờ **đo tương đối theo asset gốc** (`bg` của chính popup) + ép hiện tạm (`.MS__popup` + class `active`) — không cần biết trigger |

## 4. Kiến trúc A — `--autofix`

```
/ui-check --autofix [--coords <coords.json>…]   (mặc định: mọi coords.json trong _auto-export của task)
0  fe-gate + Lớp 1                       như hiện tại
1  geo-fix.mjs plan                      coords.json + SCSS campaign → plan.json (map, rule file:line, root)
2  browser (browserpilot run_script)     geometry-measure.js(plan) → measure.json (rect, scale, parent, forced)
   PC 1920 cho group canvas > 768 · MB 768 cho group canvas ≤ 768 · H5 chỉ PC
3  geo-fix.mjs diff                      → findings.json (position | size-mismatch | ambiguous | unmapped | waived | skipped-parent)
4  geo-fix.mjs apply                     sửa left/top trong đúng rule SCSS → applied.json
5  npm run build-dev → quay lại 2        tối đa 2 vòng
6  report                                fixed · remaining · unmapped · waived · size-mismatch · abort
```

### 4.1 Toán đo (tương đối theo root)

- Mỗi `coords.json` = 1 group. `root` = asset diện tích lớn nhất (thường `bg`). Không map/đo được
  root → dùng `#MS__wrapper` làm root với expected `(0,0,canvas.w)`.
- `s = root.measured.w / root.w` (scale runtime, không cần biết engine scale bằng gì).
- `exp = (a.x − root.x, a.y − root.y)` · `act = ((m.x − rm.x)/s, (m.y − rm.y)/s)` · `delta = act − exp`.
- `|dx| > 2 || |dy| > 2` → finding `position`. `|dw| > 2 || |dh| > 2` → `size-mismatch` (chỉ báo).

### 4.2 Guard

| Guard | Luật |
|---|---|
| Nhiều phần tử | selector khớp ≠ 1 phần tử hiển thị → `ambiguous`, không fix |
| Cha–con | phần tử cha (ancestor là asset khác) có cùng delta ±1 → con `skipped-parent`, chỉ fix cha vòng này |
| Đồng loạt | ≥4 asset và ≥50% cùng delta ±1 → `abort: uniform-offset`, không fix gì (sai quy đổi, không phải 39 bug) |
| Waiver | tên asset xuất hiện trong `.claude/knowledge/waivers.md` của campaign → `waived` |
| Không có khai báo | rule không có `left:`/`top:` cho đúng viewport (MB phải nằm trong `@include mobile {}`) → `no-declaration`, không thêm dòng mới |
| Rule dùng chung | 1 rule mà ≥2 asset cùng nhận (4 `<img class="mh-art">`) → gỡ rule, chỉ đo qua selector img (đo A bằng phần tử B rồi sửa là sai) |
| Vòng lặp | tối đa 2 vòng; vòng 2 còn → dừng, report |

### 4.3 File

| File | Vai trò |
|---|---|
| `tools/geo-fix.mjs` | `plan` · `diff` · `apply`, thuần file+JSON, không browser |
| `tools/geo-fix.test.mjs` | fixture campaign giả + coords + measure → chứng minh map/diff/apply/guard |
| `skills/ui-check/scripts/geometry-measure.js` | thân `run_script`, nhận plan qua token `/*__PLAN__*/`, trả measure JSON |
| `skills/ui-check/SKILL.md` | mục `--autofix`: thứ tự bước, guard, format report |

### 4.4 Parse SCSS & map `<img>`

Duyệt ngoặc `{}` giữ stack selector; `&` nối với cha; block `@include mobile {}` = khai báo MB,
`@include pc {}` / ngoài block = PC. Ghi `file:line` của `left:`/`top:` theo viewport. Bỏ file
`*generated.scss`. Ưu tiên rule có khai báo vị trí; rule chỉ đổi trạng thái (`&.active`) không
phải rule vị trí.

`<img>` trong twig: gom class của MỌI `<img src|data-src=…/<file>>` → rule có compound cuối chứa
`.class`. Selector đo trong dist so theo stem `img[src*="/<tên>."]` vì build đổi đuôi
`optimized/….webp`. Skill nạp plan vào `run_script` bằng loader 6 dòng qua `node:fs` (đã đo: scope
run_script có `import('node:fs')`), không paste JSON.

## 5. Kiến trúc B — `landing-parity`

```
node tools/landing-parity.mjs <campaign> [--ref <dir>…] [--json <out>]
```
- Ref mặc định: 2 campaign cùng product mới nhất có `config.js` + danh sách "Project nguồn" trong
  `~/.claude/knowledge/code-developer/base-structure.md` (đường dẫn còn tồn tại).
- So tập đặc trưng: khoá `config.js`, `{% include/extends %}`, class `MS__*`/`MJ__*`/`pm__*`,
  `data-*`, gọi platform trong JS (`window.libraryMainsite.*`, `varMS.*`), `@include`/`@import` SCSS,
  file cấp 1 trong `assets/`, script `package.json`.
- Output 2 bảng: **REF có / MỚI thiếu** (kèm `file:line` trong ref để copy) và **MỚI có / REF không**
  (class `MS__`/`MJ__` lạ = bịa → 🔴). Exit 0 (advisory); `--strict` exit 1 khi có 🔴.
- Nối: `frontend-developer.md` bước "trước khi báo xong với campaign mới/section mới: chạy parity,
  xử lý từng dòng thiếu hoặc ghi lý do bỏ"; brief dev trong `code-developer` trỏ tool; CLAUDE.md
  routing thêm 1 dòng. Quy ước cụ thể có bằng chứng (i18n `language.js` 46/366 campaign…) ghi vào
  `cdn-source-conventions.md` mục guardrails.

## 6. Test

- `geo-fix.test.mjs` (37 ca, xanh 15/9): map qua `MS__sprite`, grep `sprite($x)`, `<img class>`, rule dùng chung, unmapped;
  diff: ngưỡng, scale theo root, root fallback wrapper, ambiguous, cha–con, đồng loạt, waiver,
  size-mismatch; apply: sửa đúng dòng PC/MB, no-declaration, chạy lần 2 không đổi gì.
- `geometry-measure.js`: chạy thật qua browserpilot trên fixture HTML có vị trí biết trước
  (+ popup ẩn ép hiện) → số đo đúng ±1.
- Tích hợp: campaign tqht `2026-trung-thu-menh-hon` (GW-814), tiêm lệch `left +10px` 1 asset →
  `--autofix` trả về đúng giá trị cũ, `git diff` chỉ 1 dòng.
- `landing-parity.test.mjs` (25 ca, xanh 15/9): fixture 3 campaign + skin → thiếu/thừa đúng, đếm ref, ẩn 1-ref khi ≥3 ref, `--strict` exit 1.
- Chạy thật 15/9: gnmobinew `2026-trung-thu` vs 4 ref → 18 mục ≥2/4 ref (`separateFiles` 3/4, `base_big.html.twig` 3/4, `MS__Barlow-Regular` 3/4…), 1 🔴 `MS__Roboto_Medium`.
