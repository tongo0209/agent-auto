# Stage fix — {{KEY}} (sửa cho stage `{{callerOfFix}}`)

Bạn đang tiếp tục phiên đã code ticket này. Sửa ĐÚNG các lỗi chặn trong `{{feedbackFile}}`, không mở rộng phạm vi.
Góp ý của user (nếu có): {{rejectNote}}

Mỗi lỗi: tìm nguyên nhân (không vá triệu chứng), sửa, build lại cho tới PASS. Lỗi là báo oan (có bằng chứng) → ghi vào advisory kèm lý do, không sửa.
KHÔNG commit, KHÔNG push.

Verdict: `pass` + `files` = mọi file đã sửa; `fail` khi không sửa được.
