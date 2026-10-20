# Stage plan — {{KEY}} (luồng {{flow}}, vòng {{round}})

Việc: lập kế hoạch thực thi cho ticket {{KEY}}. KHÔNG sửa code ở stage này.

Repo: `{{repo}}` · Campaign: `{{campaignDir}}` · Thư mục run: `{{runDir}}`

1. Đọc: `~/VNG/agent-auto/tasks/{{KEY}}/brief.md` (nếu có), design trong `~/VNG/agent-auto/designs/{{KEY}}/` (ưu tiên `coords.json`/spec đã bóc, chỉ mở ảnh khi cần), code hiện có trong campaign.
2. Campaign có class `pm__` → làm theo cửa vào R-PM-11 (`node ~/VNG/agent-auto/tools/project-note.mjs path {{campaignDir}}`, đọc file dự án, gameplay đã khoá chưa). Chưa khoá và không suy được từ file dự án → `fail`, ghi câu hỏi vào blocking.
3. Ghi `{{runDir}}/plan.md`: dòng đầu `# <tiêu đề ngắn, tiếng Việt, dùng làm commit message>`; rồi: phạm vi, danh sách file sẽ sửa/tạo (`file:line` khi sửa), từng bước, cách verify (lệnh build + cổng), rủi ro, luật phải theo (trỏ mã R-*).
4. Kế hoạch bị trả về trước đó (nếu có): `{{feedbackFile}}` · Góp ý của user: {{rejectNote}}

Verdict: `pass` khi đã ghi plan.md; `fail` khi thiếu thông tin chỉ user trả lời được.
