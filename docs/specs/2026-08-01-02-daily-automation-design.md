# Tự động hoá /daily (hệ con ①)

Ngày: 2026-08-01 · Trạng thái: đã duyệt · Thứ tự thực thi: 2/4

## Quyết định khung: KHÔNG đụng Jira

User chốt lại 2026-08-01: **không ghi comment, không đổi status, không gửi Teams/Outlook**.
Hệ con này chỉ *đọc* Jira (như hiện tại) và *nhắc*.

## Vấn đề

1. **Log board không có giờ thật.** `boards/2026-08-01.md` có 10 dòng log đều mở đầu `HH:MM —`
   (placeholder chưa thay). Mất trục thời gian ⇒ không tính được lead time (hệ con ④ cần).
2. **Radar không tự chạy.** `/daily delta` phải gõ tay. Cron hệ thống không dùng được: connector
   Jira/SharePoint auth theo phiên tương tác, phiên nền không có token.
3. **Mốc gấp không ai kêu.** GW-660 mốc HTML 3/8 (còn 2 ngày) vẫn `coding · chờ duyệt` từ 31/7.
   KPI có ô "mốc sắp tới" nhưng phải mở trang mới thấy.
4. **Bug sheet chưa vào luồng.** `config.bugSheets` = `{}`; link sheet trong comment Jira chưa được
   bóc tự động.

## Giải pháp

### 1. Giờ thật trong log (sửa gốc + lưới an toàn)

- `daily/SKILL.md`: thêm luật — mọi dòng log phải lấy giờ bằng `date +%H:%M` **thật**, cấm ghi
  `HH:MM`. Đặt ở đầu section ghi board (chỗ dev đọc trước khi ghi).
- Console: dòng log còn khớp `/^HH:MM/` → tô cảnh báo + tooltip "log thiếu giờ thật". Lỗi này đã
  im lặng suốt 3 board, phải nhìn thấy được mới không lặp.

### 2. Radar chạy nền trong phiên (không cron)

- Nút toolbar **Radar 30m** (`COMMANDS` thêm entry `/loop 30m /daily delta`) — chạy trong tab
  terminal thật ⇒ giữ nguyên auth connector, cổng duyệt, skill.
- Nút mở tab mới rồi gõ luôn (`terminals.create('radar')` + `type`), để radar không chiếm tab đang
  làm việc.
- Trạng thái radar hiện ở thanh trạng thái: tab nào đang chạy loop (nhận biết bằng label tab).

### 3. Nhắc mốc — server chủ động

`server/lib/alerts.js`: đọc `state.json`, sinh cảnh báo:

| Điều kiện | Mức |
|---|---|
| mốc `html` còn ≤2 ngày mà phase ∈ {waiting-design, ready, coding} | crit |
| mốc bất kỳ đã qua mà phase chưa tới đích | crit |
| mốc `html` còn ≤4 ngày | warn |
| task `coding` không có commit mới ≥2 ngày (dùng `lib/activity.js`) | warn — "đứng yên" |

`GET /api/alerts` → `[{ key, level, text }]`. Console: dải cảnh báo trên cùng tab Hôm nay +
notification khi có cảnh báo `crit` mới (so signature như `lastNeedSignature`).

Cảnh báo "đứng yên" bắt đúng ca GW-660: không phải trễ mốc, mà **im lặng nhiều ngày** — dấu hiệu
sớm hơn.

### 4. Radar bug sheet

- `config.bugSheets`: `{ "<game>": "<url sheet>" }` — nguồn cố định per-game.
- `/daily delta` bóc thêm link `docs.google.com/spreadsheets` từ comment Jira của ticket đang mở →
  ghi `state.issues[key].bugSheets = [url]`.
- Có sheet → board thêm mục "Cần bạn": lệnh `/bug-fixer-lite <url>` **đã soạn sẵn** kèm ghi chú
  *phải chạy trong terminal CLI* (VS Code panel không có toolset Chrome).
- Console: dòng task có `bugSheets` → icon bug, bấm = gõ hộ lệnh vào terminal.

### 5. state.json bền hơn

- `state.schemaVersion = 2`; `/daily` validate khi đọc: thiếu field bắt buộc → cảnh báo trong board
  chứ không ghi tiếp lên state hỏng.
- Mỗi lần `/daily` ghi state: snapshot trước (dùng `lib/backup.js` của hệ con ②).

## Kiểm chứng

| Cái gì | Đo bằng |
|---|---|
| `/api/alerts` | dựng state giả trong scratchpad (mốc hôm qua / còn 2 ngày / còn 9 ngày) → so output với bảng trên |
| "đứng yên" | so với `git log` thật của path GW-654 (có commit 1/8) và GW-660 (không) |
| Cảnh báo HH:MM | board hôm nay đang có 10 dòng → console phải tô đúng 10 dòng |
| Nút radar | bấm → tab mới tên `radar`, dòng lệnh đúng `/loop 30m /daily delta` |
