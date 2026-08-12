# Sổ nợ đọng xuyên ngày + vá 2 bug đường board/cảnh báo

Ngày 2026-08-12. Nguồn: audit tính năng hiện hành (115 test console + 18 fe-gate + state-doctor
+ build-dashboard đều pass, 14/14 endpoint HTTP 200) — hai khiếm khuyết dưới đây **không** bị test
nào bắt vì cả hai nằm ở chỗ chưa có test.

## Vấn đề

### A. Dải cảnh báo mù với ticket chỉ có mốc `duedate`

`/api/alerts` trả `{"items":[]}` trong khi board 12/8 (skill tự viết) ghi *"GW-720 — việc gấp nhất
hôm nay: due MAI 13/8"*.

`lib/alerts.js:54` chỉ duyệt mốc có cờ `key: true` trong vocab = đúng `html` + `deliver`:

| Ticket | milestones | phase | Kết quả |
|---|---|---|---|
| GW-720 | `{duedate: 2026-08-13}` | `waiting-design` | **0 cảnh báo** — due ngày mai, chưa khởi động |
| GW-525 | `design/review1/review2/release` + `duedate 08-14` | `coding` | **0 cảnh báo** — còn 2 ngày |

`server/index.js:95-98` lấy đúng `buildAlerts()` này để bắn notification macOS ⇒
`history/notified.jsonl` dòng cuối là **11/8 03:28**: 2 ngày im lặng, đúng 2 ngày chứa mốc gấp nhất.
Bảng task vẫn hiện `Due Jira 08/13 · 1d`, nên phải mở trang và đọc bảng mới thấy — chính việc mà
`alerts.js` (comment dòng 8-9) được viết ra để khỏi phải làm.

Đây là lần thứ ba cùng lớp lỗi: file đã vá 2 lần cho ca GW-556 (`deliver` bị loại khỏi vòng mốc).
Gốc chung: gate cảnh báo tự chọn một tập mốc hẹp hơn tập mốc mà ticket thật đang mang.

### B. Mục "Cần bạn" nhiều dòng: đọc bị cắt, tick làm nát board

`lib/board.js:13` lọc `l.trim().startsWith('-')` nên mỗi mục chỉ lấy **dòng đầu**. Board 12/8 có
5 mục, 4 mục viết 2-3 dòng ⇒ 4/5 mục hiện trên UI **đứt giữa câu** (`…Cần bạn nói "[Tây Du VNG]
Tam Tiêu`).

Nặng hơn ở đường ghi. Tái hiện đúng thuật toán `routes/board.js` trên bản copy board 12/8, tick mục #0:

```diff
- - [ ] **GW-720 — việc gấp nhất hôm nay: due MAI 13/8.** Cần bạn nói "[Tây Du VNG] Tam Tiêu
+ - [x] ~~**GW-720 — việc gấp nhất hôm nay: due MAI 13/8.** Cần bạn nói "[Tây Du VNG] Tam Tiêu~~
    Nương Nương / Update hình" là làm gì và có design chưa. Chưa có gì để tôi khởi động.
```

Nửa câu bị gạch, nửa còn lại treo thành đoạn văn không thuộc mục nào; lần sau `inner()` chỉ thấy
nửa đầu nên không tick lại đúng được. Đây là 1 trong 4 đường ghi duy nhất của console và nó nát ở
dạng mục phổ biến nhất.

### C. Nợ đọng rụng theo ngày (vấn đề chính)

Board là sổ theo NGÀY; console chỉ đọc board hôm nay. Việc chưa tick ở board cũ không ai gom lại.

- Board 12/8 mang **4** việc mở · các board cũ còn tổng **62** mục `- [ ]`.
- Rơi thật: 4 việc GW-627 ở board 10/8 (*báo designer 3 lỗi trong file design* · *lỗi bản TH* ·
  *xác nhận CDN sync 5 file mp3* · *thứ tự release có ràng buộc*) `grep` ra **chỉ tồn tại ở board
  10/8**, chưa tick, không xuất hiện lại ở 11/8 hay 12/8 — mất radar 2 ngày, mà GW-627 release **15/8**.
- GW-660 *lệch bản `pm__` cần anh quyết* từng được mang tay sang board 10/8 kèm chữ "(còn từ 6/8)"
  rồi cũng biến mất.

A và C cùng một gốc: **việc rơi khỏi radar khi không ai mang tay nó đi.** B là nền của C — sổ nợ
phải đọc trọn mục và tick trọn mục.

## Thiết kế

### Nấc 0 — nền: `server/lib/needyou.js` (hàm thuần, không I/O)

```
parseNeedYou(md, section?)          → [{ index, done, text, startLine, endLine, indent }]
setChecked(md, index, done, section?) → { md, text, line } | null
appendToSection(md, section, line)  → { md, insertedAt }
matchesExpect(expectText, itemText) → boolean
```

- Mục = dòng bullet + **mọi dòng tiếp theo chưa mở bullet mới** và chưa sang `## ` khác.
- `text` nối các dòng bằng một khoảng trắng (dùng để hiện và để so `expectText`).
- `setChecked` thay **trọn khối** `startLine..endLine` bằng một dòng:
  `- [x] ~~<text>~~` hoặc `- [ ] <text>`.
  **Gộp về 1 dòng là quyết định có ý thức**: `~~` bọc qua nhiều dòng phụ thuộc bộ render, còn
  quy ước `- [x] ~~…~~` một dòng thì đang dùng tay và chắc chắn đúng. Mục đã tick không cần
  giữ nếp gấp dòng.
- `lib/board.js::section()` và `routes/board.js` chuyển sang dùng module này. `section()` giữ
  nguyên chữ ký (trả mảng string) để không phá `Log`.

### Nấc 1 — `server/lib/debt.js` (hàm thuần)

```
ownerKey(text) → 'GW-720' | null          // key GW-\d+ ĐẦU TIÊN — đúng cách skill viết
buildDebt({ boards, today, state }) → { groups, counts }
```

- `boards = [{ date, items }]`, `items` từ `parseNeedYou`.
- `radarKeys` = mọi `ownerKey` trên board **hôm nay**, **kể cả mục đã tick** — đã tick nghĩa là
  hôm nay có chạm ticket đó.
- Với mỗi board `date < today`, mỗi mục `done === false`:
  `dropped` khi `key === null` hoặc `!radarKeys.has(key)`; `staleDays = daysBetween(date, today)`.
- Gom theo ticket → `{ key, phase, items:[{date, index, text, staleDays}], staleDays }`,
  sort `staleDays` giảm dần (cũ nhất trước — cũ nhất là cái dễ quên nhất).
- Chia 2 nhóm theo đúng nếp bảng task đã có test: ticket **còn sống** hiện thẳng · ticket
  `closed`/`reassigned` (`OFF_MY_PLATE_PHASES`) gộp cuối, **folded sẵn** — đó là chỗ chứa nhiễu tháng 7.
- **Không** khớp mờ nội dung. Cùng một việc mỗi ngày diễn đạt một kiểu (GW-720 có 3 bản khác nhau,
  trùng token rất thấp) nên khớp mờ vừa không gộp được, vừa gộp oan 2 việc khác nhau cùng ticket.
  Luật theo-ticket không bao giờ báo sai tuổi vì nó không tuyên bố "cùng một việc".

### Nấc 2 — alert `debt-dropped`, gộp 1 alert/ticket

`buildAlerts(state, today, activity, debt)` — thêm tham số thứ 4, dựng sẵn ở ngoài, giữ `alerts.js`
thuần y như cách nó nhận `activity`.

- Text: `4 việc "Cần bạn" từ board 10/8 (2 ngày) chưa nhắc lại`
- `crit` khi `staleDays >= 3`, `warn` khi 1-2. Mã mới `debt-dropped`.
- Chảy vào dải cảnh báo + notification macOS sẵn có (`server/index.js:95`), dedup 12h theo
  `key|code` của `notified.jsonl`. `OFF_MY_PLATE_PHASES` ở đầu vòng tự lọc ticket `closed` khỏi
  notification ⇒ nhiễu tháng 7 chỉ nằm trong UI, không nhắc ra ngoài.

### Nấc 3 — vá A: fallback `duedate`

Trong khối mốc "giao hàng": không có mốc `key` nào trên ticket thì lấy `duedate` làm mốc cảnh báo.
Giữ nguyên 3 mã `html-overdue`/`html-urgent`/`html-near` (đổi mã sẽ làm mọi cảnh báo "đã nhắc"
trong `notified.jsonl` bật lại như mới — đúng lý do đã ghi trong file). Tên mốc trong text tự lấy
từ `MILESTONE_BY_ID` nên hiện đúng chữ **"Due Jira"**.

Chỉ fallback khi **không** có mốc `key`: GW-610/GW-477/GW-654/GW-660/GW-713 đều có `html` ⇒ hành vi
không đổi. Hôm nay thêm đúng 2 cảnh báo thật: GW-720 (còn 1 ngày, crit) + GW-525 (còn 2 ngày, crit).

### Nấc 4 — API + UI

- `GET /api/debt` → `{ today, groups, counts }`, cache 30s qua `lib/cache.js`.
- Tick **tái dùng** `POST /api/board/check` — route đã nhận `date` và đã validate
  `^\d{4}-\d{2}-\d{2}$` + chặn path ngoài `dir.boards`. Không thêm đường ghi mới.
- `src/core/api.js`: thêm `getDebt()`.
- `src/panels/todayPanel.js`: khối **"Nợ đọng từ board cũ (n)"** ngay dưới mục "Cần bạn" —
  nhóm theo ticket, mỗi mục có checkbox + badge ngày nguồn + tuổi. Tick → `POST /api/board/check`
  với `date` của board gốc + `expectText` → reload.

## Test

| File | Nội dung |
|---|---|
| `server/lib/needyou.test.mjs` | mục 1/2/3 dòng · mục cuối section · dòng tiếp có `-` trong nội dung · mục đã tick · index sai · thiếu section · tick rồi bỏ tick trở về đúng 1 dòng |
| `server/lib/debt.test.mjs` | luật theo-ticket · mục không có key · key thứ hai trong text không đổi chủ · mục đã tick ở board sau · nhóm folded theo `OFF_MY_PLATE_PHASES` · sort `staleDays` |
| `server/lib/alerts.test.mjs` | thêm: fallback `duedate` chỉ khi thiếu mốc key · ticket có `html` **không** đổi hành vi · `debt-dropped` gộp 1 alert/ticket · ngưỡng crit/warn |

Cổng chốt: `npm run check` (lint → test → test:tools → build → doctor).

## Vòng review đối kháng (4 góc × 2 skeptic, 34 agent) — 8 điểm đã sửa

Chạy sau khi triển khai xong, trước khi báo hoàn thành. 15 phát hiện, 23/30 phiếu skeptic không
phản bác được. Em đo lại từng cái trên dữ liệu thật rồi sửa 8:

| Mức | Chỗ | Vấn đề | Bằng chứng đo được |
|---|---|---|---|
| **CRITICAL** | `routes/board.js` `/board/append` | Neo điểm chèn vào **dòng bullet** cuối, nên bullet mới chèn vào GIỮA mục nhiều dòng; cú tick sau đó gộp khối và **xoá vĩnh viễn** dòng tràn của mục cũ | 2 skeptic tái hiện độc lập: board 3/8 từ 134 còn **128 dòng**, mất 6 dòng của GW-556; board 12/8 mục GW-477 mất nửa câu, nửa đó sang tên mục mới |
| MAJOR | `routes/debt.js` cache TTL 30s | Console **chính là bên ghi** board nên TTL sinh dữ liệu cũ: tick xong `/api/debt` vẫn trả mục vừa đóng | đo thật `cached=true`, 42 việc, mục vẫn còn |
| MAJOR | `debt.js` `radarKeys` | So cứng `date === today`, nhưng `readBoard()` **fallback board mới nhất** khi chưa có board hôm nay ⇒ đúng những việc đang hiện ở "Cần bạn" bị báo là rơi radar + bắn notification | **4/14 ngày** 30/7–12/8 không có board (2/8, 7–9/8). Mô phỏng hôm nay 9/8: luật cũ **49 việc/8 ticket**, luật mới **43/6** — GW-610 và GW-660 hết bị báo oan |
| MAJOR | `debt.js` `radarKeys` | Tính cả mục **đã tick** ⇒ một mục đã tick về việc khác che hết mục còn mở của cùng ticket (mất việc trong im lặng) | đảo luật; đo trên dữ liệu 12/8: **41/7 trước và sau** ⇒ bịt lỗ mà không thêm tiếng ồn |
| minor | `needyou.js` `setChecked` | Ghi lại ở cột 0 ⇒ checklist lồng bị đẩy lên cấp 1 | board hiện tại chưa có checklist lồng, nhưng đây là đường ghi → giữ `indent` |
| minor | `needyou.js` | `split('\n')`/`join('\n')` làm board CRLF lẫn EOL | board hiện tại toàn LF → vẫn giữ EOL gốc |
| minor | `routes/board.js` `/board/check` | So `normalizeText(expectText) !== item.text` = normalize **lần hai** ⇒ mục có nội dung bắt đầu bằng dấu gạch **vĩnh viễn không tick được** (409 oan) | đổi sang `matchesExpect` normalize cả hai bên |
| minor | `alerts.js` text `debt-dropped` | "11 việc từ board 30/7" đọc thành "board 30/7 có 11 việc" | ca thật GW-654: 11 mục trải **6 board** → text nói rõ "trải N board, cũ nhất …" |
| minor | `todayPanel.js` | Trạng thái mở dòng dài chỉ nằm trong DOM, `loadDebt()` re-render là mất | dùng `openDebt` giữ NGOÀI DOM, cùng cách `openNeed` đã trả giá |

7 phát hiện còn lại bị skeptic phản bác thành công, không sửa.

**Hai quyết định của lượt đầu bị đảo** (đều có test cũ khoá lại, đã thay test kèm lý do): (a)
`radarKeys` không còn tính mục đã tick; (b) "board hiện tại" = board hôm nay **hoặc board mới nhất**,
khớp `readBoard()`.

## Ranh giới giữ nguyên

Không commit/push, không ghi Jira. Chỉ ghi board — qua đúng `snapshot` + `writeAtomic` +
`expectText` hiện có. Console vẫn chỉ ghi 4 chỗ đã khai trong `console/README.md`; nấc này **không
thêm chỗ ghi mới**, chỉ sửa cho chỗ ghi board hoạt động đúng với mục nhiều dòng.
