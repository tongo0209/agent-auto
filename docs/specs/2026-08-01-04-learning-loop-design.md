# Vòng học & dự báo (hệ con ④)

> ⚠️ **LỊCH SỬ** — tiền đề của file ("chưa ghi được một bản ghi học nào") đã hết đúng: `knowledge/metrics.jsonl` có dữ liệu thật, người ghi là `console/server/lib/learn.js`. Xem schema thật ở đó, đừng lấy schema trong file này.

Ngày: 2026-08-01 · Trạng thái: đã duyệt · Thứ tự thực thi: 4/4

## Sự thật phải nhìn thẳng

Kiểm tra 2026-08-01:

```
knowledge/metrics.jsonl   0 dòng
history/issues.jsonl      không tồn tại
```

Hệ thống đã chạy 3 ngày (30/7 → 1/8) mà **không ghi được một bản ghi học nào**. Nguyên nhân: cả hai
file đều phụ thuộc `/daily wrap` — một mode phải gõ tay, cuối ngày, đúng lúc dễ bỏ nhất. Dashboard
vẫn hiện "metrics: 0 bản ghi" và không ai thấy đó là lỗi.

⇒ Kết luận thiết kế: **nguồn dữ liệu học phải là thứ sinh ra như tác dụng phụ của việc đang làm**,
không phải một bước riêng cần ý chí.

## Giải pháp

### 1. Ghi tự động, không cần `wrap`

| File | Ai ghi | Khi nào | Nội dung 1 dòng |
|---|---|---|---|
| `history/issues.jsonl` | `/daily` | mỗi lượt quét Jira | `{at, key, summary, phase, status, duedate, milestones}` |
| `history/phases.jsonl` | `/daily` | khi phase 1 ticket đổi | `{at, key, from, to, reason}` |
| `knowledge/metrics.jsonl` | console (server) | mỗi ngày 1 dòng/ticket đang mở | `{date, key, phase, commits, files, added, deleted}` từ `lib/activity.js` |

`metrics` chuyển từ *ước lượng tay* sang *đo từ git*. `wrap` chỉ còn thêm nhận xét chủ quan
(`{at, key, note}`) — bỏ quên cũng không mất dữ liệu định lượng.

Ghi append, mỗi dòng 1 JSON, không sửa dòng cũ. Ghi trùng ngày+key thì bỏ qua (idempotent).

### 2. Lead time thật từng phase

`server/lib/learn.js`: từ `phases.jsonl` dựng khoảng thời gian mỗi ticket nằm trong mỗi phase
(dùng `at` — nên hệ con ① phải sửa được giờ thật trước, không thì mọi khoảng đều 00:00).

`GET /api/learn` →

```
{ phases: [{ phase, n, medianDays, p80Days }], gates: {...}, ready: bool }
```

### 3. Dự báo trung thực

Panel "Dự báo" trong tab Theo tháng:

- `n ≥ 3` → "phase `coding` thường mất 2.1 ngày (median, n=5)".
- `n < 3` → **in thẳng "chưa đủ dữ liệu (n=1)"**, không nội suy, không bịa số. Dự báo sai còn tệ hơn
  không dự báo: nó làm bạn hoãn việc gấp.
- Ticket đang chạy: so thời gian đã nằm trong phase với median → "GW-660 ở `coding` 2.4 ngày, dài
  hơn median 2.1 ngày" (chỉ hiện khi `n ≥ 3`).

### 4. Bài học tự gom

`knowledge/lessons.md` — mỗi bài học 1 block cố định:

```
## <slug>
- Bắt được: <hiện tượng>
- Nguyên nhân: <gốc>
- Lưới chặn: <check/luật đã thêm>
- Nguồn: <ticket · ngày>
```

Nguồn ghi: (a) `fe-gate` fail → tự append block nháp có sẵn 3 field đầu; (b) `/daily wrap`; (c) tay.
`code-developer` đọc file này trước khi giao dev (đã có bước "đọc knowledge" trong skill — nay có
file chuẩn để đọc).

## Kiểm chứng

| Cái gì | Đo bằng |
|---|---|
| ghi được thật | chạy 1 lượt console + 1 lượt `/daily` → `wc -l` 3 file phải > 0 |
| idempotent | chạy 2 lần liền → số dòng không tăng lần 2 |
| lead time đúng | dựng `phases.jsonl` giả (3 ticket, mốc giờ rõ) → so median tính tay |
| không bịa số | xoá bớt còn n=1 → UI phải in "chưa đủ dữ liệu (n=1)" |
