# Spec #1 — Phiên làm việc tự mở + hai tín hiệu bug tự đẩy

Ngày chốt: 2026-09-21 · Trạng thái: đã duyệt thiết kế, chưa có plan

## 1. Mục tiêu

Hai việc mỗi ngày đang phải làm bằng tay, trong khi máy đã có đủ dữ liệu để tự làm:

1. Mở console xong vẫn phải tự gõ `claude` ở từng tab.
2. QC mở lại bug đã báo xong, hoặc ticket sang giai đoạn QC test mà chưa ai giao buglist —
   không có gì báo, tự nhớ hoặc tự vào tab Bug nhìn.

Spec này chỉ giải quyết đúng hai việc đó. Ba mảng còn lại (vòng ngày, cổng chất lượng, vòng
design) có spec riêng, làm sau.

## 2. Bối cảnh đã kiểm chứng (không phải giả định)

| Thứ | Ở đâu | Tình trạng |
|---|---|---|
| Phát hiện QC mở lại bug | `tools/bug-radar.mjs:177,428,637` — `diffRows()` trả `reopened`, ghi vào `lastScan.reopened` | ĐÃ CHẠY, không ai đọc thành cảnh báo |
| Nơi sinh cảnh báo | `console/server/lib/alerts.js:53 buildAlerts()` — mỗi alert có `level` + `code` | ĐÃ CHẠY, là chỗ duy nhất |
| Thông báo desktop | `console/server/lib/notify.js:27 notifyNewCrits()` qua `osascript` | ĐÃ CHẠY, chỉ bắn alert `crit` MỚI |
| Quét nền 30 phút | `tools/radar-tick.mjs:191` gọi `claude -p` headless | ĐÃ CHẠY |
| Đối chiếu board fix | `console/server/lib/fixboard.js` | ĐÃ CHẠY, đo 22ms lạnh / 3ms nóng |
| Spawn terminal | `console/server/ws/terminal.js:19,27` spawn `$SHELL -l`, KHÔNG spawn `claude` | Chủ ý: claude thoát thì shell còn sống |
| Nối lại phiên cũ | `ptyStore` + `{type:'attached', resumed}` | Reload không giết claude đang chạy |

Kết luận: đây là bài toán **nối dây**, không phải dựng hệ mới.

## 3. Phạm vi

TRONG: 2 rule cảnh báo mới; preset mở phiên đầu ngày; nút gõ sẵn lệnh trên cảnh báo; test cho cả hai.

NGOÀI (cố ý, YAGNI): tín hiệu "bug mới từ QC" và "đã fix chưa ghi sheet" — user không chọn, và cả
hai đã hiển thị sẵn trên tab Bug. Không thêm API, không thêm job nền, không thêm file server mới.

## 4. Thiết kế

### 4.1 Tín hiệu `bug-reopened` — level `crit`

Thêm rule vào `buildAlerts()`. Nguồn: `state.bugWatch[sheetId].lastScan.reopened` (mảng bugId).

- Chỉ tính sheet đang `following`.
- Chỉ tin khi lượt quét còn tươi: dùng đúng ngưỡng 6h của cờ `stale` đang có trong
  `console/server/lib/bugs.js` (`OPEN_FRESH_MS`), KHÔNG khai ngưỡng mới.
- Nội dung: ticket key (hoặc tên buglist nếu không có mã) + số bug + danh sách `#id`.
- `crit` nên `notifyNewCrits()` tự bắn thông báo macOS — không phải viết thêm gì.

### 4.2 Tín hiệu `qc-test-no-buglist` — level `warn`

- Điều kiện: ticket ở giai đoạn QC test, và key của nó không xuất hiện trong bất kỳ
  `bugWatch[].keys` nào.
- Chỉ tính ticket còn của mình: lọc qua `isOffMyPlate` (`server/lib/vocab.js`) — cùng cổng mà
  cảnh báo/nợ/doctor đang dùng, tránh lặp ca GW-654 (đếm mốc của người đã nhận bàn giao).
- Giai đoạn "QC test" suy từ `schema/vocab.json`, CẤM hardcode tên phase.
- `warn` nên KHÔNG bắn desktop — đây là việc nhắc, không phải báo động.

### 4.3 Nút hành động trên cảnh báo

Cảnh báo `bug-reopened` kèm nút gõ **sẵn** `/bug-fixer-lite <url sheet>` vào tab claude đang mở,
bằng `typeDraft` (không Enter). Ranh giới: việc đọc tự chạy, việc ghi ra ngoài chờ user Enter —
sheet là tài liệu dùng chung với QC.

### 4.4 Preset mở phiên đầu ngày

- `server/ws/terminal.js` giữ nguyên `spawn($SHELL -l)`.
- `TerminalManager.restore()`: không có tab cũ → mở 2 tab (tab 1 chạy lệnh khởi động, tab 2 trống).
- Lệnh khởi động khai trong `config.json` (mặc định `claude`); rỗng thì không gõ gì.
- **Chốt chặn:** chỉ gõ khi server trả `attached.fresh === true`. Tab nối lại sau reload tuyệt đối
  không bị gõ đè lên phiên claude đang chạy.

## 5. Xử lý sai số

| Ca | Hành vi |
|---|---|
| `lastScan` cũ hơn 6h | Không sinh alert reopened (số liệu không đáng tin) |
| Sheet không map được ticket | Alert dùng tên buglist thay mã task |
| `config.json` không khai lệnh khởi động | Mở tab trống như hiện nay |
| Server chưa trả `attached` | Không gõ gì — thà thiếu còn hơn gõ đè phiên đang chạy |
| `osascript` lỗi / không phải macOS | `notifyNewCrits` đã best-effort sẵn, không được làm vỡ API |

## 6. Test

`console/server/lib/alerts.test.mjs`:
- reopened + lượt quét tươi → 1 alert `crit` mã `bug-reopened`
- reopened + lượt quét quá 6h → không alert
- sheet đang tắt theo dõi có reopened → không alert
- ticket giai đoạn QC test, không buglist → 1 alert `warn` mã `qc-test-no-buglist`
- ticket giai đoạn QC test, đã có buglist → không alert
- ticket đã bàn giao người khác → không alert

`console/src/terminal/` (test thuần, không cần browser):
- phiên mới (`fresh`) → có gửi lệnh khởi động
- phiên nối lại (`resumed`) → KHÔNG gửi
- lệnh khởi động rỗng → không gửi

## 7. Tiêu chí nghiệm thu

1. `npm run check` xanh toàn bộ (lint · test · test:tools · build · doctor).
2. Dựng state giả có 1 bug reopened → console hiện đúng 1 cảnh báo đỏ kèm nút gõ lệnh.
3. Mở console ở trạng thái chưa có tab → đúng 2 tab, tab 1 có prompt claude, tab 2 là shell.
4. Reload trang khi claude đang chạy → không có ký tự nào bị gõ thêm vào tab đang chạy.
