# Stage plan — {{KEY}} (luồng {{flow}}, vòng {{round}})

Việc: lập kế hoạch thực thi cho ticket {{KEY}}. KHÔNG sửa code ở stage này.

Repo: `{{repo}}` · Campaign: `{{campaignDir}}` · Thư mục run: `{{runDir}}`

1. Đọc: `~/VNG/agent-auto/tasks/{{KEY}}/brief.md` (nếu có), design trong `~/VNG/agent-auto/designs/{{KEY}}/` (ưu tiên `coords.json`/spec đã bóc, chỉ mở ảnh khi cần), code hiện có trong campaign.
2. Campaign có class `pm__` → làm theo cửa vào R-PM-11 (`node ~/VNG/agent-auto/tools/project-note.mjs path {{campaignDir}}`, đọc file dự án, gameplay đã khoá chưa). Chưa khoá và không suy được từ file dự án → `fail`, ghi câu hỏi vào blocking.
3. Ghi `{{runDir}}/plan.md`: dòng đầu `# <tiêu đề ngắn, tiếng Việt, dùng làm commit message>`; rồi: phạm vi, danh sách file sẽ sửa/tạo (`file:line` khi sửa), từng bước, cách verify (lệnh build + cổng), rủi ro, luật phải theo (trỏ mã R-*).
4. Cuối plan.md thêm mục bắt buộc (console đọc để user chọn). Heading phải bắt đầu ở đầu dòng, không thụt lề:
```markdown
## Phương án
Viết 2–3 cách làm khác nhau thật sự, mỗi cách:
### A · <tên ngắn>
Cách làm 1–2 dòng. Đánh đổi: <được gì / mất gì>.
### B · <tên ngắn>
Cách làm 1–2 dòng. Đánh đổi: <được gì / mất gì>.
### C · <tên ngắn>   (tuỳ chọn)
Cách làm 1–2 dòng. Đánh đổi: <được gì / mất gì>.
```
   Chỉ có 1 cách hợp lý ⇒ ghi đúng 1 mục `### A · <tên>` và 1 dòng vì sao không có cách khác ngay dưới `### A`. Không bịa lựa chọn.
5. Landing chia được thành ≥2 section mà tập file sửa/tạo RỜI nhau (mỗi file chỉ thuộc 1 section) → ghi thêm `{{runDir}}/sections.json` = `{"sections":[{"id":"<id section = tên folder, R-STR-1>","files":["<đường dẫn tương đối repo>",…]}]}`; driver sẽ cho mỗi section 1 lane và kiểm section nào xong trước. File dùng chung (popup chung, `main/`, layout) mà nhiều section cùng cần sửa → KHÔNG ghi sections.json (làm 1 lượt implement).
6. Kế hoạch bị trả về trước đó (nếu có): `{{feedbackFile}}` · Góp ý của user: {{rejectNote}}

Verdict: `pass` khi đã ghi plan.md; `fail` khi thiếu thông tin chỉ user trả lời được.
