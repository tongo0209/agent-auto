# knowledge/ — vòng học của bộ này

Ba thứ, ba số phận khác nhau trong git:

| File | Ai ghi | Vào git |
|---|---|---|
| `lessons.md` | `tools/fe-gate.mjs` tự append block nháp mỗi lần gate FAIL; `/daily wrap` và `/code-developer learn` bổ sung | **có** — bài học là của cả team |
| `metrics.jsonl` | Console tự ghi 1 dòng/ngày/ticket, **đo từ git** | không — số của riêng bạn |
| `gates/<KEY>.json` | Báo cáo `fe-gate` lần cuối của từng ticket → badge trong tab Review | không |

## `lessons.md` bắt đầu từ rỗng

Bản phát hành **không** mang theo bài học của người khác — chúng nhắc tên ticket, tên sản phẩm, tên
người, và bài học của dự án khác thường gây nhiễu hơn là giúp. File này của bạn lớn dần theo việc
bạn làm.

Chưa có file cũng **không sao**: `fe-gate` tự tạo (`mkdir` + `append`) lần đầu ghi. Skill nào đọc mà
không thấy thì coi như chưa có bài học nào.

## Khuôn một bài học

`fe-gate` ghi nháp đúng khuôn dưới, bạn điền tiếp dòng "Nguyên nhân". Tự viết tay thì giữ nguyên
4 dòng này — `/code-developer` đọc theo khuôn để biết bài học nào còn liên quan:

```markdown
## gate-<mã check>-<YYYY-MM-DD>
- Bắt được: 3 ERROR (FONT_MISSING) trên dist — font khai trong CSS mà không có file
- Nguyên nhân: clone khung cũ nên thiếu font của design mới
- Lưới chặn: fe-gate check FONT_MISSING (đã bắt được, giữ trong luồng code-developer)
- Nguồn: <tên folder> · 2026-08-20
```

Vì sao đáng ghi: loại lỗi này build **0 error**, checker **PASS**, browser fallback im lặng — chỉ
`fe-gate` bắt được. Không ghi lại thì lần sau vẫn mất đúng chỗ đó.
