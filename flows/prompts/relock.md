# Stage relock — gameplay-change {{KEY}}

Cơ chế gameplay của `{{campaignDir}}` đổi giữa chừng. Nguồn yêu cầu: note/chat/Jira của {{KEY}} và task cha — chỉ tin nguồn bằng chữ, cấm đoán gameplay từ hook (R-PM-11).
Ghi `{{runDir}}/relock.md`: gameplay cũ (mục Khoá file dự án) → gameplay mới + cặp `AI-RULES-<gameplay>.md`/`MASTER-<gameplay>.html` trong `ai-template-kit`; bảng diff kit cũ↔mới: popup/module bỏ (cắt NGUYÊN block), thêm, hook BE mới (đã có tên chưa).
KHÔNG chạy `project-note lock`, KHÔNG sửa code — người duyệt khoá ở approve-plan.

Verdict: `pass` khi có gameplay mới từ nguồn bằng chữ; `fail` + câu hỏi trong blocking khi nguồn không nói rõ.
