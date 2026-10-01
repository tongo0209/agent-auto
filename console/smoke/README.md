# smoke — phần máy chạy được, và phần còn phải kiểm bằng mắt

## Máy chạy được: `npm run smoke`

```bash
cd console
npm run build     # smoke có kiểm trang / + bundle js, chưa build thì check đó FAIL
npm run smoke
```

Script tự bật console trên cổng NGẪU NHIÊN còn trống (không bao giờ 4747 — đó là console thật của
user), trỏ `CONSOLE_STATE`/`CONSOLE_CONFIG` vào `console/fixtures/`, gọi `/api/alerts`, `/api/bugs`,
`/`, bundle js, rồi tự kill tiến trình theo PID mình sinh ra. Đây là lệnh RIÊNG, KHÔNG nằm trong
`npm run check` (nó bật server thật, chậm hơn).

Đang kiểm: alert `bug-reopened` (crit + `sheetUrl`) · alert `qc-test-no-buglist` (warn) · `/api/queue` (bug-reopened
vào now hạng 0 + lệnh fixbug, qc-test vào nhóm chờ + tin nhắn chép, không còn dòng `debt-dropped`) · hoãn/bỏ hoãn qua
`POST /api/queue/snooze` (ghi file tạm `CONSOLE_SNOOZE`, kiểm `history/snooze.json` thật không bị ghi) · phân nhóm
buglist `following`/`off`/`closed` · trang `/` 200 + bundle js tải được · `state.json`,
`config.json`, `knowledge/metrics.jsonl`, `history/notified.jsonl` THẬT không bị ghi (so size@mtime
trước ↔ sau).

`/api/alerts` vẫn đọc `boards/` THẬT (nợ "Cần bạn" — `dir.boards` chưa có biến môi trường), nên
output có thể kèm 1 alert `debt-dropped` mang mã ticket thật. Mọi khẳng định đều lọc theo `code` nên
không ảnh hưởng kết quả.

## CHƯA tự động được: 3 thứ cần trình duyệt thật

Repo không có playwright/puppeteer/jsdom và task này không thêm dependency ⇒ 3 mục dưới **chưa
verify bằng máy**, phải mở mắt kiểm (hoặc giao agent có browser). Dựng cảnh:

```bash
cd console
CONSOLE_STATE=$(node fixtures/stamp.mjs reopened) CONSOLE_CONFIG=fixtures/config.json npm run serve
# mở URL console in ra (KHÔNG phải 4747 nếu console thật đang chạy)
```

Server phụ có bấm nút ghi (✓ báo xong, hoàn tác) thì trỏ thêm `CONSOLE_PHASES` + `CONSOLE_BACKUPS` sang thư mục tạm — thiếu là ghi vào `history/phases.jsonl` thật và xoay mất bản backup thật trong `.backups/` (giữ 30).

### 1. Nút "fix bug" trên dải cảnh báo
1. Tab **Hôm nay** → dải cảnh báo trên cùng.
2. ĐÚNG: có dòng đỏ `2 bug bị QC mở lại: #12, #34 — Buglist giả lập — đợt 1`, cuối dòng có nút
   `fix bug`. Dòng vàng `đang ở giai đoạn QC test…` (fixture `qc-no-buglist`) KHÔNG có nút.
3. Bấm `fix bug`. ĐÚNG: terminal ĐANG MỞ hiện đúng chuỗi
   `/bug-fixer-lite https://sheets.example.invalid/fixture-following` và **con trỏ đứng cuối dòng,
   lệnh CHƯA chạy** (`typeDraft` cố ý không Enter).
4. SAI: không có nút · bấm xong lệnh tự chạy (đã Enter) · chuỗi gõ vào tab khác tab đang mở.

### 2. Preset 2 tab đầu ngày
1. DevTools → Application → Local Storage → xoá key `console.terms` (và `console.termlayout`), rồi F5.
2. ĐÚNG: mở lên có **đúng 2 tab** (`term 1`, `term 2`), tab 1 đang active và trong tab 1 có dòng
   `echo fixture-startup` đã được gõ **và đã chạy** (in ra `fixture-startup`); tab 2 là shell trống.
3. SAI: chỉ 1 tab · 3 tab trở lên · lệnh khởi động chạy trong tab 2 · không tab nào chạy lệnh.

### 3. F5 không gõ đè phiên cũ
1. Ở trạng thái mục 2, gõ tay vào tab 1 một chuỗi chưa Enter, ví dụ `dang-go-do-dang`.
2. F5 trang (KHÔNG xoá localStorage).
3. ĐÚNG: vẫn 2 tab cũ, nội dung tab 1 còn nguyên kèm chuỗi đang gõ dở, và **không có
   `echo fixture-startup` lần hai** (`startup.mjs` chỉ gõ vào phiên `fresh`).
4. SAI: xuất hiện thêm `echo fixture-startup` · terminal trắng / mất phiên đang chạy · số tab đổi.
