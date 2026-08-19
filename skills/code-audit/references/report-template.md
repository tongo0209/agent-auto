# Mẫu báo cáo

Giữ đúng thứ tự: hiểu → phán → gợi ý. Không đảo, không bỏ Phần A.

```markdown
# code-audit — <tên repo/folder>

Mode: diff (so với base `<ref ngắn>`) · <n> file · <m> dòng · rule pack: <packs>
Kết quả: 🔴 <a> chặn MR · 🟡 <b> nên sửa · ⚪ <c> gợi ý

## A. Chỗ này đang làm gì

**Luồng chính.** <1-3 câu: dữ liệu vào từ đâu, xử lý gì, ra đâu.>

**Ràng buộc đang chịu.**
- <hook platform / template dùng chung / file legacy / API cố định / breakpoint team> — <ảnh hưởng gì tới cách code>

**Vì sao vài chỗ viết như vậy.**
- `<file:line>` — <cách viết> vì <lý do chính đáng tìm được>. Không phải issue.

## B. Cần xử lý

### 🔴 Chặn MR

**B1. <tiêu đề một dòng>**
- Ở: `<file:line>`
- Kịch bản hỏng: <user làm X → hỏng Y, cụ thể, kiểm chứng được>
- Vì sao: <neo vào ràng buộc nào ở Phần A>
- Sửa: <đề xuất ngắn, đủ để làm ngay>

### 🟡 Nên sửa

**B2. <tiêu đề>**
- Ở: `<file:line>` (+ các chỗ liên quan)
- Kịch bản hỏng: <sau này sửa Z → vỡ W>
- Sửa: <đề xuất>

### ⚪ Gợi ý (không chặn)

- `<file:line>` — <một dòng>

## C. Cần user trả lời

- <câu hỏi khi không tự quyết được: hook nào đúng, vùng này còn thuộc FE không, đổi field có phải yêu cầu mới>

## D. Đã xem nhưng không tính là issue

- <fact bị loại + lý do loại — để lần sau không phải cãi lại>
```

Mục **D** là phần giữ uy tín báo cáo: nó cho thấy đã soi tới đó và loại có lý do, không phải bỏ sót.

Mục **C** chỉ chứa câu hỏi thực sự chặn phán quyết. Không có thì bỏ mục.

Terminal in bản gọn: 1 dòng kết quả + toàn bộ 🔴 (tiêu đề + `file:line`) + tiêu đề 🟡 + số lượng ⚪ + đường dẫn file báo cáo.
