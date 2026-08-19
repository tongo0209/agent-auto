# Nâng cấp agent-auto — hợp đồng dữ liệu + tính năng đứng trên nền đó

> ⚠️ **MỘT PHẦN LỖI THỜI** — khối JSON `vocab` từng chép trong file này đã lệch 7 chỗ so với bản thật nên đã được thay bằng 1 dòng trỏ nguồn. Nguồn vốn từ duy nhất: `schema/vocab.json`.

- Ngày: 2026-08-03
- Phạm vi: `console/` (web local) · `tools/` · skill `~/.claude/skills/daily/`
- Trạng thái: design đã chốt (user: "làm full"), chờ kế hoạch triển khai

## 1. Vì sao làm đợt này

Ngày 3/8 hệ này sinh ra **hai bug cùng một họ** trong vòng một buổi sáng:

1. Skill `/daily` ghi `phase: "reassigned"` cho GW-654 (đổi assignee sang người khác). Console
   không biết từ đó nên ticket **vừa lọt vào timeline + dải mốc + KPI** (đọc thành "mình sắp trễ"
   trong khi mốc đã là của người khác) **vừa mất hẳn khỏi bảng task** — dòng bị bỏ im lặng.
2. Số đếm trên tiêu đề bảng lệch số dòng vẽ ra (`(4)` / 3 dòng).

Cả hai không phải lỗi đánh máy mà là **drift hợp đồng dữ liệu**: skill là bên GHI `state.json`,
console là bên ĐỌC, và vốn từ nằm rải ở 3 chỗ không ai đồng bộ với ai.

Số đo hiện trạng (đo ngày 3/8):

| Đo | Con số | Hệ quả |
|---|---|---|
| Code console | 4.476 dòng JS; to nhất `src/panels/todayPanel.js` **586 dòng** | 1 file gánh KPI + dải mốc + timeline + bảng + nhóm + 4 loại ô |
| Test | server 4 ca (chỉ chuyện nhảy cổng) · client **0** · `fe-gate` 18 ca | Logic đọc state (phase · mốc · nhóm · đếm) không có test nào |
| Lint / format | không có | |
| Git | **0 commit**, 12 mục untracked | 5 ngày dựng hệ, không có điểm quay về |
| `dashboard.html` | khối DATA **viết tay**; file 10:59 trong khi `state.json` 11:25 | UI thứ hai tự lệch — sáng 3/8 nó vẫn ghi GW-654 là việc của user |
| Vốn từ phase | 3 nguồn: `src/core/constants.js` · `server/lib/phases.js` · prose trong `SKILL.md` | Ổ của cả 2 bug trên |

## 2. Mục tiêu

- Thêm một phase/loại mốc mới chỉ phải sửa **một** chỗ.
- `state.json` sai hợp đồng thì **bị bắt tự động**, không chờ user nhìn thấy board lạ.
- Mỗi bug ngày 3/8 có **một ca test** khoá lại.
- Một lệnh duy nhất (`npm run check`) trả lời được "hệ có ổn không".
- Dữ liệu hệ đã thu (`history/*.jsonl`, lead time, effort git) được **dùng** chứ không chỉ nằm đó.

### Không phải mục tiêu (YAGNI)

Không ghi ngược Jira · không tự `git commit`/`push` · không đổi jQuery sang framework ·
không thêm database · không cron hệ thống (auth connector Jira/SharePoint chỉ sống trong phiên
CLI tương tác, nên giữ `/loop`) · không đụng `gt-promotion-template` (ngoài luồng `/daily`).

## 3. Nấc 1 — Hợp đồng dữ liệu

### 3.1 `schema/vocab.json` — nguồn duy nhất của vốn từ

Đặt ở `agent-auto/schema/vocab.json` (ngoài `console/`) vì cả console **và** skill đều đọc.

**Nội dung `vocab.json` KHÔNG chép lại ở đây** — bản chép trong spec này đã lệch 7 chỗ so với bản thật
(sai `htmlDone` cho `deliver`/`wait-test`/`bugfix`, thiếu `lateExempt`…). Đọc thẳng `schema/vocab.json`;
`tools/state-doctor.mjs` kiểm state theo đúng file đó.

Ý nghĩa từng cờ, và ai đọc nó:

| Cờ | Ai đọc | Dùng làm gì |
|---|---|---|
| `label` `icon` `sev` | client | nhãn + icon + màu của phase |
| `group` | client | tên nhóm dòng trong bảng task; thứ tự nhóm = thứ tự phase trong mảng |
| `folded` | client | nhóm đóng sẵn ở cuối bảng, và **suy ra số đếm tiêu đề** |
| `dim` | client | hàng timeline vẽ mờ (FE xong, mốc còn lại của BE/QC) |
| `offMyPlate` | client + server | loại khỏi timeline · dải mốc · KPI · cảnh báo |
| `htmlTodo` | server (`alerts.js`) | phase còn phải ra HTML → chỉ những phase này mới cần nhắc "design đã giao mà chưa tải về". Cờ `htmlDone` từng có ở đây đã bị **gỡ**: sau khi cổng cảnh báo mốc chuyển sang `lateExempt`, không consumer nào đọc nó nữa, và cờ chết trong file chịu lực là bẫy (người sau bật/tắt rồi tưởng hành vi đổi). Có 1 ca test canh việc này |
| `key` | server (`alerts.js`) + client (`gantt`) | mốc GIAO HÀNG — cảnh báo mốc duyệt đúng các mốc này, và nhãn luôn được hiện trên trục. Gồm `html` và `deliver`: task có kênh promotion giao qua `deliver` và KHÔNG có mốc `html`, nên chỉ soi `html` là mù hẳn nhóm đó (ca GW-556) |
| `needsHandoff` | `state-doctor` (W3) | phase bắt buộc phải có `tasks/<KEY>/handoff.md`. Tách thành cờ riêng vì không suy được từ `offMyPlate` — `closed` cũng `offMyPlate` mà không cần bàn giao |
| `active` | client (KPI "đang chạy") + `state-doctor` (W2) | việc đang nằm trong tay mình (`coding` · `deliver` · `bugfix`) |
| `lateExempt` | client (`isLate`) | miễn nhãn "trễ mốc HTML". Tách riêng khỏi `htmlDone` **có chủ ý**: `deliver` là `htmlDone` nhưng KHÔNG miễn — đang giao mà quá mốc thì vẫn là trễ. Danh sách này giữ đúng hành vi `isLate` cũ, không đổi ngầm |
| `active` | client | KPI "đang chạy" |
| `mustDeliver` | server (dải mốc) | mốc phải giao; `duedate` là mốc hành chính nên `false` |
| `key` | client (`gantt`) | mốc luôn được hiện nhãn dù chật chỗ |

**Cách nạp:**
- Server: `require('../../schema/vocab.json')` gói trong `server/lib/vocab.js`, phơi ra các
  mảng dẫn xuất (`OFF_MY_PLATE_PHASES`, `HTML_TODO_PHASES`, `HTML_DONE_PHASES`, `MUST_DELIVER`).
  File `server/lib/phases.js` (tạo ngày 3/8) bị `vocab.js` thay thế và xoá đi.
- Client: `src/core/constants.mjs` nạp bằng **đường dẫn tương đối**
  `import vocab from '../../../schema/vocab.json' with { type: 'json' }` rồi dựng `PHASE`,
  `TASK_GROUPS`, `MILESTONE_LABEL`, `OFF_MY_PLATE_PHASES`, `DIM_PHASES`, `FOLDED_PHASES`.
  **Không dùng alias webpack** (`@schema`): alias chỉ webpack hiểu, còn `node --test` chạy `.mjs`
  bằng ESM resolver thật nên `@schema/vocab.json` bị coi là tên package → `ERR_MODULE_NOT_FOUND`.
  Đường dẫn tương đối là thứ duy nhất cả hai runtime cùng hiểu (đo thật 3/8).
- Skill: `SKILL.md` **trỏ** tới `schema/vocab.json` là nguồn vốn từ, bỏ bảng phase kể lại trong prose.

**Giới hạn của "một chỗ":** thêm phase dùng icon đã có = sửa đúng 1 file (`vocab.json`). Nếu phase
mới cần **hình icon chưa có**, phải thêm 1 dòng import trong `src/core/icons.js` — vì icon là file
SVG nhúng vào bundle lúc build, JSON không tham chiếu được. Đây là ngoại lệ duy nhất, và
`state-doctor` bắt được nó: `icon` khai trong vocab mà không có trong `icons.js` → ERROR (E7).

**Một chỗ vẫn phải là code, không phải JSON:** nhóm `Chờ design` hiện tách 2 tình huống bằng hàm
`where` (`design.status === 'đã-giao-chưa-tải'` → nhóm riêng "Design đã giao · chờ tải về").
Hàm không biểu diễn được trong JSON, nên `constants.mjs` giữ đúng **một** tinh chỉnh này và
comment rõ vì sao.

### 3.2 `tools/state-doctor.mjs` — soi state theo hợp đồng

Cùng khuôn `tools/fe-gate.mjs` đang chạy tốt: in danh sách phát hiện, `--json <path>` ghi báo cáo,
exit ≠ 0 khi còn ERROR, kèm self-test riêng.

| Mã | Mức | Luật |
|---|---|---|
| E1 | ERROR | `phase` không có trong vocab |
| E2 | ERROR | key trong `milestones` không có trong vocab (trừ key mở đầu `_` = ghi chú của skill) |
| E3 | ERROR | giá trị mốc không phải `YYYY-MM-DD` (trừ key `_`) |
| E4 | ERROR | `design.status` ngoài enum |
| E5 | ERROR | thiếu `schemaVersion` hoặc ≠ 2 |
| E6 | ERROR | `paths[].repo` không có trong `config.repos` |
| E7 | ERROR | `icon` khai trong `vocab.json` mà `src/core/icons.js` không có (xem mục 3.1) |
| W1 | WARN | `paths[].path` không tồn tại trên đĩa |
| W2 | WARN | phase `coding`/`deliver` mà không có `paths` (không đo được effort) |
| W3 | WARN | phase `reassigned` mà thiếu `tasks/<KEY>/handoff.md` |
| W4 | WARN | `milestones` rỗng (không biết deadline nào) |
| W5 | WARN | còn key `_conflict` (mốc còn tranh chấp, chưa hỏi lại ai) |

Chạy ở 3 nơi: `npm run check` · lúc server boot (in ra log, không chặn khởi động) ·
`GET /api/doctor` cho console.

Self-test (`tools/state-doctor.test.mjs`): mỗi mã E/W có ít nhất 1 ca dựng state giả để chứng minh
luật bắt được thật, cộng 1 ca state sạch → 0 phát hiện.

### 3.3 Tách `todayPanel.js`

Kéo phần chia nhóm + đếm ra `src/core/grouping.mjs` — hàm thuần, không DOM, không icon:

```
groupTasks(issues, { filterText, expandedGroups }) →
  { groups: [{ label, phases, folded, items }], trackedTotal, trackedMatched, orphans }
```

`todayPanel.js` chỉ còn việc vẽ. Ước còn ~450 dòng.

### 3.4 Test client — khoá đúng các bug đã trả giá

Ràng buộc kỹ thuật đã kiểm: `console/package.json` **không** có `"type": "module"` nên `.js` bị
Node coi là CJS; muốn `node:test` import được thì module thuần phải là `.mjs`, và
`webpack.config.js` phải thêm `.mjs` vào `resolve.extensions` (hiện chỉ có `.js`). Vì vậy các
module thuần được test đổi sang `.mjs`: `format.mjs` · `grouping.mjs` · `marks.mjs` ·
`constants.mjs`. Module có `import … from '*.svg'` (như `icons.js`) **không** test được bằng
`node:test` → phần layout nhãn mốc của gantt tách ra `src/core/marks.mjs` (thuần) rồi test ở đó.

Ca test bắt buộc có (mỗi ca ứng với một lỗi thật):

1. phase lạ (không có trong vocab) → **vẫn ra dòng**, nằm trong nhóm "Phase lạ", không mất im lặng.
2. `trackedTotal` luôn bằng số dòng ngoài nhóm `folded`.
3. ticket `offMyPlate` → không xuất hiện trong danh sách vẽ timeline, không vào dải mốc.
4. ticket `dim` → có hàng timeline nhưng mang cờ mờ.
5. `isLate` không tính ticket `reassigned`/`closed`.
6. dải mốc: ticket có mốc nghiệp vụ thì bỏ `duedate`; ticket **chỉ** có `duedate` thì vẫn giữ.
7. key mốc mở đầu `_` không bao giờ thành chấm/nhãn trên trục.
8. 2 mốc gần nhau < ngưỡng → chỉ 1 nhãn hiện, và mốc `key: true` (HTML) luôn giành được chỗ.

### 3.5 Lint + một cổng chốt

- `eslint.config.mjs` (flat config), preset khuyến nghị + `no-unused-vars` + `eqeqeq`; không
  format lại toàn bộ code cũ trong đợt này (tránh diff rác), chỉ bắt lỗi thật.
- `npm run check` = `eslint .` → `node --test` (server + client) → `webpack --mode production`
  → `node ../tools/state-doctor.mjs`. Đây là câu trả lời duy nhất cho "xong chưa".

### 3.6 Git — dựng nhưng không tự commit

Soát `.gitignore` (chắc chắn loại `designs/`, `.backups/`, `console/node_modules/`, `console/dist/`),
soạn nội dung commit đầu tiên theo format `[agent-auto] <English subject>` + trailer Co-Authored-By.
**Không chạy `git commit`** — theo luật riêng của user, hỏi trước từng lần, kể cả commit local.

## 4. Nấc 2 — Tính năng đứng trên nền đó

### 4.1 `dashboard.html` sinh tự động

`tools/build-dashboard.mjs` đọc `state.json` + board hôm nay + `vocab.json`, giữ nguyên phần CSS +
script hiện có của `dashboard.html`, chỉ sinh lại khối `const BOARD = {…}`. Ghi tmp rồi rename.
Gọi ở bước cuối `/daily` và qua `npm run dashboard`.

Test: state mẫu → HTML sinh ra không chứa ticket `offMyPlate`, số thẻ mốc đúng bằng số mốc
`mustDeliver` trong 14 ngày.

### 4.2 Delta "có gì mới từ lần bạn xem"

`GET /api/delta?since=<ISO>` đọc `history/issues.jsonl` (mỗi lần `/daily` quét ghi 1 dòng/ticket)
và `history/phases.jsonl`, so dòng mới nhất với dòng tại mốc `since`, trả về:

```
[{ key, changes: [{ type, from, to, at }] }]     type ∈ status | duedate | milestone | phase
```

(Không có loại `bugsheet`: `history/issues.jsonl` chỉ ghi `at · key · summary · phase · status ·
duedate · milestones`, không mang `bugSheets` — suy ra được thì mới báo, không bịa loại thay đổi.)

Client giữ `lastSeenAt` trong `localStorage`, hiện một dòng gọn trên tab Hôm nay
(`3 thay đổi từ 09:12 · xem`), bấm mở danh sách, bấm nữa đánh dấu đã xem. Hàm so sánh là hàm
thuần trong `server/lib/delta.js` → test bằng 2 bộ dòng jsonl giả.

### 4.3 Sổ bàn giao khi đổi người

Ca GW-654: code đã push nên người nhận thấy được, nhưng 4 việc ngoài repo (docs rule chưa có ·
14 câu hỏi PM chưa gửi · mốc 5/8 vs 17/8 chưa chốt · popup thiếu trigger + thiếu font) chỉ nằm
trong `note` của `state.json` — không ai ngoài user đọc.

Khi phase → `reassigned`, `/daily` sinh `tasks/<KEY>/handoff.md` gồm: mốc còn tranh chấp
(`_conflict`), `questions-for-pm.md` đã gửi chưa, kết quả `fe-gate` cuối, commit đã push,
việc dở ngoài repo (bóc từ `note`). Drawer ticket hiện checklist tick được — ghi atomic + chống
race 409 y hệt mục "Cần bạn" của board. `state-doctor` W3 cảnh báo nếu thiếu file này.

### 4.4 Nhắc mốc ra ngoài trang

Hiện `onNotify` chỉ chạy khi trang đang mở và mất focus → đóng tab là im. Chuyển việc soi về
server (`alerts.js` đã chạy mỗi 60s): alert mức `crit` **mới** → notification macOS qua
`osascript -e 'display notification …'`.

- Chống spam: cùng một `(key, code)` không nhắc lại trong 12h — nhớ ở `history/notified.jsonl`.
- Công tắc: `config.notify` (mặc định `true`). Tắt là im hẳn.
- `shouldNotify(alert, log, now, config)` là **hàm thuần** → test 5 ca: mới · trùng trong 12h ·
  đã quá 12h · công tắc tắt · mức không phải crit.
- `osascript` lỗi (không phải macOS, quyền bị chặn) → log rồi bỏ qua; **không** được làm sập server.

### 4.5 Dự báo ngày xong

Nguyên liệu đã có mà chưa dùng: lead time thật từng phase (`learn.js`, từ `phases.jsonl`) + effort
đo từ git (`activity.js`). Với ticket `coding`: `forecast(phase, phaseStartedAt, leadTimes, today)`
→ `{ date, samples }` hoặc `null`. Hiện ở cột "Mốc kế" thành dòng phụ `HTML 10/8 · dự báo 8/8`,
tô đỏ khi dự báo vượt mốc.

Giữ đúng luật "không bịa" đã có trong hệ: dưới 3 mẫu thì trả `null` và UI in "chưa đủ dữ liệu",
không nội suy. Hàm thuần → test với bộ mẫu giả (0 mẫu · 2 mẫu · 5 mẫu · phase không có mẫu).

### 4.6 `/daily` gọn lại

`SKILL.md` đang 529 dòng và tự kể lại bảng phase — chính chỗ lệch với console. Tách phần tra cứu
sang `references/` (recipe JQL · SharePoint/Graph · cách đọc nexus), giữ `SKILL.md` là luồng + luật,
bảng phase thay bằng một dòng trỏ `schema/vocab.json`.

Thêm mode `/daily doctor`: chạy `state-doctor`, tự sửa cái sửa được (ngày sai định dạng, key ghi chú
đặt sai chỗ), báo cái không tự sửa được.

## 5. Xử lý lỗi & rollback

- Mọi lần ghi vào `agent-auto/` vẫn đi qua `server/lib/backup.js`: snapshot vào `.backups/<bucket>/`
  (giữ 30 bản) rồi ghi atomic (tmp + rename). Danh sách chỗ console được ghi tăng từ 3 lên 4
  (thêm `tasks/<KEY>/handoff.md`) — cập nhật cả 2 README.
- `state-doctor` **chỉ đọc**.
- Notification là best-effort.
- `build-dashboard` ghi tmp rồi rename; lỗi thì giữ file cũ.

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Webpack chưa resolve `.mjs`; đổi đuôi file làm build đứt | Việc đầu tiên của nấc 1: thêm `.mjs` vào `resolve.extensions` + build thật trước khi đổi tiếp |
| Client import JSON ngoài `console/` (alias `@schema`) | Verify bằng 1 build thật ngay sau khi thêm alias |
| Đổi `constants.js` → `constants.mjs` đụng 6 file import | Đổi trong 1 lượt, `npm run check` chốt |
| Server chạy nền 54 phút không tự restart để ăn code mới | Việc thuộc server phải nêu rõ trong plan là "cần user restart"; không tự kill process đang host tab terminal |
| `state.json` do LLM ghi nên có thể sinh key mới bất kỳ lúc nào | Đó chính là lý do có `doctor` + nhóm "Phase lạ" — sai thì **ồn ào**, không im lặng |

## 7. Thứ tự triển khai

Nấc 1 chạy trước và phải xanh `npm run check` mới sang nấc 2.

1. `.mjs` vào webpack + alias `@schema` → build thật (rào chắn cho mọi bước sau)
2. `schema/vocab.json` + `server/lib/vocab.js` (xoá `phases.js`) + `src/core/constants.mjs`
3. `grouping.mjs` + `marks.mjs` tách khỏi `todayPanel.js`/`gantt.js`
4. `format.mjs` + 8 ca test bắt buộc (mục 3.4)
5. `tools/state-doctor.mjs` + self-test + `/api/doctor` + dải cảnh báo
6. eslint + `npm run check` + soát `.gitignore` (không commit)
7. `tools/build-dashboard.mjs`
8. `/api/delta` + dòng "có gì mới"
9. `handoff.md` (skill sinh + drawer tick + luật W3)
10. Notification server-side
11. Dự báo ngày xong
12. Gọn `SKILL.md` + mode `/daily doctor` + cập nhật 2 README

## 8. Tiêu chí xong của cả đợt

- `npm run check` xanh, chạy được từ máy sạch.
- Thêm 1 phase giả vào `vocab.json` (dùng icon đã có) → hiện đúng trong bảng + timeline + dải mốc
  **mà không sửa file nào khác**; xoá đi thì `doctor` báo ERROR đúng ticket đang dùng phase đó.
- 8 ca test của mục 3.4 xanh, và mỗi ca gãy được nếu cố tình bỏ luật (kiểm bằng cách đảo 1 điều
  kiện rồi thấy test đỏ).
- `dashboard.html` sinh ra khớp `state.json` (không còn số liệu viết tay).
- Đóng hết tab console mà vẫn nhận được nhắc khi có alert `crit` mới.
