# Đánh Done ticket Jira khi đã bàn giao qua gt-promotion (nút trên console)

Ngày chốt: 2026-08-10 · Trạng thái: đã duyệt, đang thi công

## Vấn đề

Task có kênh promotion: FE chép output vào `<gt-promotion>/<game>/<slug>-<nexusId>/mainsite/`,
user push tay. Bàn giao xong thì ticket Jira vẫn treo, phải nhớ vào Jira đổi status tay.

Muốn: console tự biết ticket **đã bàn giao qua gt-promotion chưa**; đã rồi thì một nút đánh Done.

## Ranh giới (user chốt)

- **KHÔNG ghi gì vào description.** Đã update trong gt-promotion là đủ làm bằng chứng bàn giao;
  không chèn link, không chèn block, không đụng một ký tự nào trong description của PM.
- **Chỉ task có kênh promotion.** Nhận diện: ticket có `promoFolder` trong `state.json`.
  Landing tĩnh cdn-source và mainsite thuần → không có nút.
- **Done phải hỏi trước.** Nút không tự bắn; hiện dialog xác nhận rồi mới transition.

> Bản trước của spec này thiết kế cơ chế chèn block ADF vào description (kèm `lib/jiraDoc.js` và
> test của nó). User bỏ hướng đó ngày 10/08 — module và test đã xoá, không giữ lại.

## Bằng chứng "đã bàn giao"

Ba điều kiện, thiếu một là chưa:

1. Ticket có `promoFolder` trong `state.json` (vd GW-713 → `221_JXM/RequestH5BinhChonVoLam_56193`).
2. Folder `<promoFolder>/mainsite/` có file thật.
3. Commit đụng folder đó **đã lên `origin/<branch>`** (branch hiện tại của repo là `develop`).

Điều kiện 3 là mấu chốt: file nằm trên máy mà chưa push thì PM không thấy gì — đánh Done lúc đó là
báo cáo sai. Kiểm bằng `git fetch` rồi `git log origin/<branch> -- <folder>`.

Thêm một cảnh báo mềm: folder còn thay đổi **chưa commit/chưa push** (`git status --porcelain`) →
đã bàn giao lần trước nhưng bản mới nhất chưa lên. Console vẫn cho Done nhưng phải nói rõ ra,
để user tự quyết chứ không nuốt mất thông tin.

## Kiến trúc

```
console UI (drawer ticket)
   ├─ GET  /api/jira/delivery/:key   → { state, commit, at, files, dirty }
   │        └─ lib/deliver.evaluateDelivery(...)   ← THUẦN, test được
   └─ POST /api/jira/done/:key       { expectUpdated }
            └─ lib/jira  : getTransitions → transition
```

`lib/deliver.js` là hàm thuần: nhận sẵn kết quả git dạng chuỗi + danh sách file, trả verdict.
Mọi lệnh git và mọi lời gọi mạng nằm ngoài nó — nhờ vậy test được toàn bộ luật quyết định
mà không cần repo giả lập hay Jira thật.

## An toàn

1. **Chặn Done non** — chưa đủ 3 điều kiện thì route trả 409, không transition.
2. **Chống race** — client gửi `expectUpdated` = `fields.updated` lúc nó đọc; lệch → 409, bắt reload.
   Cùng khuôn `expectText` ở `routes/handoff.js:57`.
3. **Hỏi trước** — dialog xác nhận ở UI, tách khỏi hành động kiểm tra.
4. **Không có đường ghi description** trong toàn bộ tính năng — không tồn tại code để lỡ tay.

## Token

`console/.env` (thêm `.env` vào `.gitignore` — hiện chưa có mục nào cho secret), server đọc
`JIRA_EMAIL` + `JIRA_TOKEN`, Basic auth REST v3. Không log token ở bất kỳ đâu.
Thiếu token → route trả 501 kèm hướng dẫn tạo, không im lặng fail.

## Test

- **Thuần** (`deliver.test.mjs`): đủ 3 điều kiện → delivered · thiếu `promoFolder` → không áp dụng ·
  folder rỗng → chưa có file · chưa push → chặn · đã push nhưng còn dirty → delivered kèm cảnh báo.
- **Chạy thật**: gọi GET `/api/jira/delivery/GW-713` xem verdict có khớp thực tế repo không
  (đọc thuần, không đổi gì trên Jira) trước khi cho bấm Done.

## Không làm (YAGNI)

- Không ghi description, không comment, không tự gắn label.
- Không tự động Done theo lịch — chỉ khi user bấm.
- Không tự push hộ user (luật global: không commit/push).
