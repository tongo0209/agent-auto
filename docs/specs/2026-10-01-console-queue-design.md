# Console — hàng đợi "Làm gì tiếp" (1/10/2026)

## Vấn đề
Tab Hôm nay dồn 8 khối lên một màn (KPI · cảnh báo · dải 14 ngày · Gantt · bảng task · Cần bạn ·
nợ đọng · log). Đo 1/10: 27 ticket theo dõi nhưng chỉ 5 còn sống — khung chiếm màn, việc thật chìm.
User chốt: mở console ra phải thấy ngay **làm gì tiếp**.

## Quyết định (user đã chọn)
1. Tab **Hôm nay** = hàng đợi + ô thêm việc. Dải 14 ngày, Gantt, bảng task, log → tab mới **Tổng quan**.
   Bỏ 4 ô KPI (hàng đợi đã đếm). Dải `#alerts` cũ bỏ — cảnh báo nhập vào hàng đợi.
2. Server ghép (`server/lib/queue.js` thuần + `GET /api/queue`), client chỉ vẽ.
3. 3 nhóm + hoãn lưu ở `history/snooze.json`.

## Nhóm & hạng
| Nhóm | Hạng | Nguồn | Hành động |
|---|---|---|---|
| now | 0 | doctor ERROR (crit) | gõ `/daily doctor` |
| now | 0 | alert crit: `html-overdue`, `html-urgent`, `bug-reopened` | mở ticket · `fix bug` |
| now | 1 | bug chờ duyệt (`pendingSheetWrite`), 1 dòng / sheet | sang tab Bug |
| now | 2 | review: ticket có file chưa commit / commit chưa push | sang tab Review |
| now | 2 | "Cần bạn" chưa tick của board hôm nay | tick → `/api/board/check` |
| now | 3 | alert warn (`html-near`, `no-commit`, `stale`, `design-not-downloaded`, code lạ), doctor WARN gom 1 dòng | mở ticket / `/daily doctor` |
| waiting | — | `qc-test-no-buglist`, `design-overdue` | chép tin nhắn đòi |
| debt | — | từng mục nợ của `buildDebt` (thay alert gom `debt-dropped`) | tick → board GỐC |

Trong nhóm: hạng → mốc kế gần nhất (null cuối) → mã ticket. Code alert chưa biết rơi vào `now/3`
để không bao giờ biến mất im lặng.

## ID ổn định
- alert: `alert:<code>:<key>[:<dedup>]` — không dùng chữ (chữ đổi mỗi ngày "còn 1 ngày" → "còn 0").
- doctor: `doctor:<code>:<key>`; bug: `bugs:<sheetId>`; review: `review:<key>`.
- need: `need:<sha1(text)[0..10]>`; debt: `debt:<date>:<sha1(text)[0..10]>`.

## Hoãn
`history/snooze.json` = `{ <id>: { until: "YYYY-MM-DD", level, text, at } }`.
- Ẩn khi `today < until`. Hết hạn thì hiện lại; lần ghi sau tự dọn mục hết hạn.
- **Leo thang:** hoãn lúc `warn` mà giờ là `crit` → hiện lại ngay.
- `POST /api/queue/snooze { id, until | null, level, text }` — `until: null` = bỏ hoãn.
- Lựa chọn UI: 1 ngày · 3 ngày · tới mốc kế (khi ticket có mốc tương lai).
- `CONSOLE_SNOOZE` ghi đè đường dẫn (smoke không đụng file thật).

## Không đổi
`alerts.js` + vòng notify macOS phía server giữ nguyên. Notification trình duyệt cho `crit` mới
chuyển từ `renderAlerts` sang panel hàng đợi.

## Kiểm
- `server/lib/queue.test.mjs`: phân nhóm, hạng, sort, ID ổn định, hoãn, leo thang, debt-dropped bị bỏ.
- Smoke: `/api/queue` trên fixture + POST snooze chỉ ghi file tạm.
- `npm run check` + mở trình duyệt thật 1920×1080 xem 2 tab Hôm nay / Tổng quan.
