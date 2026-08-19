# Design: Nối git ↔ Jira ticket (suy phase + effort thật)

> ⚠️ **LỊCH SỬ** — format `knowledge/metrics.jsonl` trong file này đã lệch với bản thật. Nguồn đúng: `console/server/lib/learn.js`.

**Ngày:** 2026-07-31 · **Trạng thái:** Đã duyệt · Nối tiếp `2026-07-31-daily-console-design.md`

## Vấn đề

`metrics.jsonl` đang 0 dòng: vòng học không chạy vì phụ thuộc `/daily wrap` gõ tay. Phase task
cũng đang do skill *suy từ note*, không dựa vào việc thật. Trong khi đó git đã ghi lại chính xác
mọi thứ đã làm — chỉ thiếu cầu nối sang ticket.

Commit message KHÔNG chứa Jira key (dạng `(feat): add Rừng Thu Kỳ Bí H5 landing minigame for CFL`),
nên không khớp được bằng key. Nhưng **đường dẫn repo chi tiết tới từng campaign**, đó là cầu nối tin cậy.

## Bằng chứng đã kiểm (2026-07-31)

| Kiểm | Kết quả |
|---|---|
| Granularity path | `products/<game>/landing/<campaign>` — GW-660 ⇒ `products/cfl/landing/2026-rung-ky-bi` |
| Neo nexusId | folder gt-promotion `A49-CFL/h5rungkybi-56985` chứa đúng nexusId 56985 của GW-660 |
| Bẫy slug | folder là `2026-rung-ky-bi`, thiếu chữ "thu" của "Rừng Thu Kỳ Bí" ⇒ khớp tuyệt đối sẽ trượt, phải khớp theo token |
| **Bẫy đo effort** | commit khởi tạo campaign: **120 file / +13.707 dòng** nếu tính hết, nhưng chỉ **6 file / +1.692 dòng** là source thật — `dist/` + `assets/` + lock chiếm 88% |

## 1. Contract: `paths` trong state.json

Điểm khớp duy nhất giữa skill và console:

```json
"GW-660": {
  "paths": [
    { "repo": "cdn-source", "path": "products/cfl/landing/2026-rung-ky-bi" },
    { "repo": "gt-promotion-template", "path": "A49-CFL/h5rungkybi-56985" }
  ],
  "pathsConfirmed": true,
  "estimate": null
}
```

Skill ghi, console chỉ đọc. Skill tự chạy `git log` bằng Bash nên không phụ thuộc console có bật.

## 2. Đoán mapping (skill, lúc quét/prep)

1. **Neo chắc theo nexusId**: tìm folder trong `<gtPromotionRoot>/*/` khớp `*-<nexusId>` → nhận
   luôn, không hỏi.
2. **Đoán fuzzy cdn-source**: bỏ dấu tên event → tách token (`rung|thu|ky|bi`) → so với
   `products/*/landing/*`, `products/*/mainsite`, `products/*/skin-*`; điểm = số token trùng.
   Ứng viên hợp lệ khi ≥2 token trùng.
3. Một ứng viên trội hẳn (điểm cao nhất và cao hơn hạng nhì) → tự nhận, ghi 1 dòng vào board.
   Nhiều ứng viên ngang nhau hoặc không có → đưa vào **bảng duyệt kế hoạch có sẵn** để user chọn
   (KHÔNG thêm cổng hỏi mới).
4. Lưu `paths` + `pathsConfirmed`. Không hỏi lại. Sửa tay: `/daily link <KEY> <repo> <path>`.

## 3. Suy phase — git chỉ NÂNG, không HẠ

| Điều kiện | Phase |
|---|---|
| Có commit ≤7 ngày trong path cdn-source | tối thiểu `coding` |
| Có commit trong `<gt-promo>/…/mainsite/` | `deliver` |
| Không commit + chưa có design | giữ `waiting-design` |
| Phase hiện tại ∈ {wait-test, bugfix, done-fe} | **không bị kéo về** `coding` |

Lý do "chỉ nâng": một commit sửa vặt sau khi đã giao QC không được làm task nhảy lùi.

## 4. Đo effort — LOẠI build output

Khi đếm dòng đổi, **bỏ** đường dẫn khớp: `/dist/`, `/assets/`, `node_modules/`,
`package-lock.json`, `*.min.*`, `html-validation-report.txt`.
Đếm 3 chỉ số: `commits`, `activeDays` (số ngày khác nhau có commit), `sourceAdded/sourceRemoved`.
Số file/dòng "thô" (kèm dist) KHÔNG dùng để đo — chỉ dùng khi hiển thị chi tiết 1 commit.

`/daily` mỗi lần chạy append `knowledge/metrics.jsonl`:
`{date, key, month, phase, estimate, commits, activeDays, sourceAdded, sourceRemoved}`
(dedupe theo `key+date`). Tab Lịch sử vẽ ước lượng (từ kế hoạch, lưu `state.issues[key].estimate`)
vs thực tế (commits/activeDays).

## 5. Console: panel hoạt động trên card

- `GET /api/activity` → mỗi ticket có `paths`: `{key, commits, activeDays, sourceAdded, sourceRemoved, lastCommit:{hash,date,subject,repo}, pathMissing}`.
  Dùng lại `lib/git.js` + `lib/cache.js` (TTL 60s).
- `GET /api/activity/:key` → danh sách commit của riêng ticket đó (cho modal).
- Card thêm dòng `🔨 12 commit · 3 ngày làm · +1.692 dòng · cuối 30/07 15:48`, bấm → modal commit.
- Ticket chưa gắn folder → `chưa gắn folder` + nút gõ `/daily link <KEY>` vào terminal.

## 6. Lỗi

- `paths` trỏ folder đã xoá/đổi tên → API trả `pathMissing: true`, card cảnh báo, lần chạy sau
  skill đoán lại.
- Chỉ thấy commit trên branch đang checkout (giới hạn đã biết, ghi trong console/README).
- git chậm → cache 60s, và activity gọi 1 lệnh/path (số path nhỏ: ~1-2/ticket).

## 7. Nghiệm thu

| Ca | Kỳ vọng |
|---|---|
| GW-660 | ra đúng 2 path; activity có số commit thật > 0; effort đếm source ≈1.692+ dòng (không phải 13.707); phase suy = `coding` |
| GW-525 (Trung Thu, chưa có campaign) | `chưa gắn folder`, **không** đoán bừa sang campaign khác |
| Console | card hiện dòng hoạt động, modal liệt kê đúng commit của ticket, 0 console error |

## Ngoài scope (user không chọn)

Cảnh báo "im lặng" khi sắp tới mốc mà không có commit · tab Git gom nhóm theo ticket.
